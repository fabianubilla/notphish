/**
 * hybrid.js — NotPhish Motor Híbrido v3
 * Capa de fusión entre el motor JS y el modelo ML.
 *
 * Responsabilidades:
 *  - computeEvidenceGate(): ¿tiene el texto base técnica suficiente?
 *  - computeFinalScore(): fusiona JS score + ajuste ML
 *  - computeReviewNeeded(): detecta contradicción fuerte JS vs ML
 *  - combineHybridResult(): construye el resultado completo para la UI
 *
 * NO genera texto libre. Los hints vienen de hints.js.
 * NO toca los detectores del motor JS.
 */

/* global HYBRID_CONFIG, selectHint, getHintSummary, getThreatCategoryLabel */

// ── Configuración (se sobreescribe con config.json al arrancar) ───────────────
const HYBRID_CFG = (typeof HYBRID_CONFIG !== "undefined" && HYBRID_CONFIG) || {
  thresholds:       { risk_bajo: 25, risk_medio: 50, risk_alto: 75 },
  evidence_gate:    { min_words_for_ml_boost: 12, min_js_signals_for_open: 1 },
  score_adjustment: { ml_legit_max_discount: 13, ml_scam_max_boost: 11,
                      ml_min_conf_for_adjust: 0.70, ml_conf_scale: 25 },
  hard_floors: {
    otp_mfa_scam: 55, otp_theft: 55, brand_domain_spoof: 55,
    boss_impersonation: 45, two_stage_bec: 35, bec_bank_change: 60,
    suspicious_domain: 30, delivery_scam: 40, direct_data_harvest: 45,
    delivery_action_combo: 40,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. EVIDENCE GATE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Determina si el ML puede influir en el score y en qué dirección.
 *
 * "blocked" → texto muy corto sin señales JS: ML no ajusta nada
 * "partial" → sin señales JS activas: ML solo puede BAJAR el score
 * "open"    → hay señales JS activas: ML puede subir o bajar
 *
 * @param {Array}  jsAlerts    - alerts del motor JS
 * @param {number} wordCount   - palabras en el texto (viene del servidor ML)
 * @param {number} jsScore     - score calculado por el motor JS
 * @returns {"blocked"|"partial"|"open"}
 */
function computeEvidenceGate(jsAlerts, wordCount, jsScore) {
  const cfg       = HYBRID_CFG.evidence_gate;
  const minWords  = cfg.min_words_for_ml_boost || 12;

  // Señales JS activas (excluir trust signals)
  const activeSignals = (jsAlerts || []).filter(a => a.severity > 0 && !a.isTrust);
  const hasJsSignals  = activeSignals.length >= (cfg.min_js_signals_for_open || 1);

  // Trust signals presentes — si hay señales de legitimidad claras
  // (unsubscribe, OTP legítimo, newsletter, official_notif, security_notice),
  // el ML NO debe subir el score aunque tenga alta confianza.
  const trustSignals    = (jsAlerts || []).filter(a => a.isTrust);
  const hasStrongTrust  = trustSignals.some(a =>
    ["legit_otp","legit_reportage","legit_official_notif",
     "legit_security_notice","legit_commercial_urgency",
     "trust_newsletter","trust_unsubscribe"].includes(a.family)
  );

  // Texto demasiado corto y sin señales JS → bloqueado
  if (wordCount < minWords && !hasJsSignals && jsScore < 10) {
    return "blocked";
  }

  // Si hay trust signals fuertes → partial (ML solo puede bajar)
  // Evita que el ML suba el score de newsletters, OTP legítimos, etc.
  if (hasStrongTrust && !hasJsSignals) {
    return "partial";
  }

  // Sin señales JS activas pero texto suficiente → "semantic"
  // Nuevo estado: el ML puede hacer un boost LIMITADO si tiene muy alta confianza
  if (!hasJsSignals) {
    return "semantic";
  }

  // Con señales JS: ajuste libre
  return "open";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. HARD FLOORS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Devuelve el hard floor activo más alto entre todos los alerts.
 * El score final nunca puede quedar por debajo de este valor.
 */
function computeHardFloor(jsAlerts) {
  const floors = HYBRID_CFG.hard_floors || {};
  let maxFloor = 0;
  for (const alert of (jsAlerts || [])) {
    if (alert.isTrust) continue;
    const floor = floors[alert.family] || 0;
    if (floor > maxFloor) maxFloor = floor;
  }
  return maxFloor;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FINAL SCORE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Calcula el score final fusionando JS + ML.
 *
 * Orden de operaciones:
 *  1. Partir del technical_score (JS)
 *  2. Aplicar trust discount (ya lo hace el JS, pero lo respetamos)
 *  3. Ajuste ML según evidence gate
 *  4. Aplicar hard floor
 *  5. Clamp 0–100
 *
 * @param {number} jsScore       - score del motor JS (ya incluye trust discount)
 * @param {object|null} mlResult - resultado del servidor ML (null si no disponible)
 * @param {"blocked"|"partial"|"open"} evidenceGate
 * @param {number} hardFloor
 * @returns {number}
 */
function computeFinalScore(jsScore, mlResult, evidenceGate, hardFloor, jsAlerts) {
  let score = jsScore;

  if (mlResult && mlResult.ml_available) {
    const cfg         = HYBRID_CFG.score_adjustment;
    const mlLabel     = mlResult.ml_label;
    const mlConf      = mlResult.ml_confidence || 0;
    const uncertain   = mlResult.uncertain;
    const scale       = cfg.ml_conf_scale || 25;
    const maxBoost    = cfg.ml_scam_max_boost || 11;

    // ── Umbrales diferenciados por gate ─────────────────────────────────────
    // En gate=open con señales JS reales, bajamos el umbral de conf ML
    // a 0.62 para que el ML pueda actuar incluso con confianza moderada.
    // En partial/semantic mantenemos 0.70 para ser más conservadores.
    const minConf = (evidenceGate === "open")
      ? (cfg.ml_min_conf_open || 0.62)
      : (cfg.ml_min_conf_for_adjust || 0.70);

    if (!uncertain && mlConf >= minConf) {
      const delta = Math.round((mlConf - 0.55) * scale);

      // ── Descuento base ────────────────────────────────────────────────────
      // Tres niveles de descuento según confianza y tipo de señal hard:
      //
      // NIVEL 1 (descuento alto, ≤36 pts): ML=legit≥0.70 + las señales duras
      //   son SOLO brand_link_spoof / brand_content_spoof (FP frecuente en retailers)
      //   Y no hay brand_domain_spoof (que casi nunca es FP).
      //   Esto resuelve el Grupo A: 40 casos donde el ML ya sabe la respuesta.
      //
      // NIVEL 2 (descuento medio, ≤26 pts): ML=legit≥0.82 + sin hard floor crítico.
      //   Cobertura general existente ampliada.
      //
      // NIVEL 3 (descuento base, ≤13 pts): resto de casos.

      const nonTrustHard = (jsAlerts || []).filter(a =>
        a.severity > 0 && !a.isTrust && !a.isWeak
      );
      const hardFamilies = new Set(nonTrustHard.map(a => a.family));

      // brand_spoof_only: señales duras son solo variantes de brand spoof (no domain spoof)
      const onlyBrandSpoof = nonTrustHard.length > 0
        && nonTrustHard.every(a =>
            ["brand_link_spoof","brand_content_spoof","phone_in_message",
             "entity_infra_mismatch","authority","authority_credential_combo"].includes(a.family)
          )
        && !hardFamilies.has("brand_domain_spoof")  // domain spoof es más fiable
        && !hardFamilies.has("suspicious_domain")
        && !hardFamilies.has("lookalike_domain");

      const hasCriticalFloor = hardFloor >= 55;
      const isHighConfLegit  = mlLabel === "legit" && mlConf >= 0.82;

      const effectiveDiscount =
        (mlLabel === "legit" && mlConf >= 0.70 && onlyBrandSpoof && !hasCriticalFloor)
          ? Math.min(36, Math.round(delta * 1.5))      // Nivel 1: brand_spoof FP
        : (isHighConfLegit && !hasCriticalFloor)
          ? Math.min(26, cfg.ml_legit_max_discount * 2) // Nivel 2: alta confianza
        : Math.min(13, cfg.ml_legit_max_discount || 13); // Nivel 3: base

      if (evidenceGate === "open") {
        if (mlLabel === "legit") {
          score = Math.max(0, score - Math.min(delta, effectiveDiscount));
        } else if (mlLabel === "scam") {
          score = Math.min(100, score + Math.min(delta, maxBoost));
        }

      } else if (evidenceGate === "partial") {
        // ML solo puede bajar (hay trust signals)
        if (mlLabel === "legit") {
          score = Math.max(0, score - Math.min(delta, effectiveDiscount));
        }

      } else if (evidenceGate === "semantic") {
        // Sin señales JS técnicas — boost semántico limitado
        if (mlLabel === "legit") {
          score = Math.max(0, score - Math.min(delta, effectiveDiscount));
        } else if (mlLabel === "scam" && mlConf >= 0.85) {
          const semanticBoost = Math.min(20, Math.round((mlConf - 0.85) / 0.15 * 10 + 10));
          score = Math.min(100, score + semanticBoost);
        }
      }
      // Si gate === "blocked" → no ajustar nada
    }
  }

  // Aplicar hard floor (inviolable)
  score = Math.max(score, hardFloor);

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. REVIEW NEEDED
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Detecta contradicción fuerte entre JS y ML.
 * Cuando hay review_needed, la UI muestra "señales mixtas" sin escalar la alarma.
 */
function computeReviewNeeded(jsScore, mlResult, hardFloor, evidenceGate) {
  if (!mlResult || !mlResult.ml_available) return false;

  const mlLabel   = mlResult.ml_label;
  const mlConf    = mlResult.ml_confidence || 0;
  const uncertain = mlResult.uncertain;

  // ML dice legit con alta confianza pero JS dice peligroso con hard flags
  if (mlLabel === "legit" && mlConf >= 0.70 && jsScore >= 60 && hardFloor >= 30) {
    return true;
  }

  // ML dice scam con confianza media-alta pero JS no ve nada técnico
  // (gate=semantic o partial) → señal de posible semántico puro
  if (mlLabel === "scam" && mlConf >= 0.75 && jsScore <= 10 &&
      (evidenceGate === "semantic" || evidenceGate === "partial")) {
    return true;
  }

  // Incierto + hay señales moderadas
  if (uncertain && jsScore >= 30) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RISK LEVEL
// ─────────────────────────────────────────────────────────────────────────────
function finalRiskLevel(score) {
  const t = HYBRID_CFG.thresholds || {};
  if (score >= (t.risk_alto  || 75)) return "Crítico";
  if (score >= (t.risk_medio || 50)) return "Alto";
  if (score >= (t.risk_bajo  || 25)) return "Medio";
  return "Bajo";
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. COMBINE HYBRID RESULT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Función principal: combina resultado JS + resultado ML en el output final.
 *
 * @param {object}      jsResult  - Resultado de analyze() del motor JS
 * @param {object|null} mlResult  - Resultado del servidor ML (null = no disponible)
 * @param {string}      text      - Texto original del usuario
 * @returns {object}              - Output contract completo para la UI
 */
function combineHybridResult(jsResult, mlResult, text) {
  const mlAvail    = !!(mlResult && mlResult.ml_available);
  const jsScore    = jsResult.score || 0;
  const jsAlerts   = jsResult.alerts || [];
  const wordCount  = mlResult?.word_count || (text ? text.trim().split(/\s+/).length : 0);

  // ── Pasos de cálculo ──────────────────────────────────────────────────────
  const evidenceGate = computeEvidenceGate(jsAlerts, wordCount, jsScore);
  const hardFloor    = computeHardFloor(jsAlerts);
  const finalScore   = computeFinalScore(jsScore, mlResult, evidenceGate, hardFloor, jsAlerts);
  const reviewNeeded = computeReviewNeeded(jsScore, mlResult, hardFloor, evidenceGate);
  const riskLevel    = finalRiskLevel(finalScore);

  // ── Hard flags activos (para hints y floor logic) ─────────────────────────
  const floorCfg   = HYBRID_CFG.hard_floors || {};
  const hardFlags  = jsAlerts
    .filter(a => !a.isTrust && (floorCfg[a.family] || 0) > 0)
    .map(a => a.family);

  // ── Contexto para selectHint ──────────────────────────────────────────────
  const hybridCtx = {
    final_score:   finalScore,
    evidence_gate: evidenceGate,
    hard_flags:    hardFlags,
    review_needed: reviewNeeded,
    contradicts_js: reviewNeeded,
  };

  // ── Seleccionar hint ──────────────────────────────────────────────────────
  let hintId  = "insufficient_evidence";
  let summary = "";

  if (typeof selectHint !== "undefined") {
    hintId  = selectHint(jsResult, mlResult || {}, hybridCtx);
    summary = getHintSummary ? getHintSummary(hintId) : "";
  } else {
    // Fallback si hints.js no está cargado
    hintId  = finalScore >= 50 ? "generic_scam"
            : finalScore >= 25 ? "mixed_signals"
            : "insufficient_evidence";
    summary = finalScore >= 50
            ? "El mensaje tiene múltiples señales de fraude."
            : "No detectamos señales suficientes para concluir.";
  }

  // ── Threat category ───────────────────────────────────────────────────────
  const mlSub   = mlResult?.ml_subcategory || "unknown";
  const mlConf  = mlResult?.ml_confidence  || 0;
  const subcatLabel = (typeof getThreatCategoryLabel !== "undefined")
    ? getThreatCategoryLabel(mlSub)
    : null;

  // threat_category solo si ML está disponible y score es relevante
  const threatCategory = (mlAvail && mlSub !== "unknown" && finalScore >= 25)
    ? mlSub : null;
  const threatLabel = threatCategory ? (subcatLabel || threatCategory) : null;

  // Confianza de amenaza (para UI)
  let threatConfidence = "desconocida";
  if (mlAvail) {
    if (mlConf >= 0.80) threatConfidence = "alta";
    else if (mlConf >= 0.65) threatConfidence = "media";
    else if (mlConf >= 0.55) threatConfidence = "baja";
  }
  // Si no hay ML, derivar de señales JS
  if (!mlAvail) {
    threatConfidence = jsResult.confidence_level || "baja";
  }

  // ── Señales para UI ───────────────────────────────────────────────────────
  // Regla: si NO hay señales hard (isWeak=false), las señales débiles
  // no se muestran en la UI — el hint ya comunica "sin evidencia fuerte".
  // Si HAY señales hard, se muestran todas (incluyendo débiles como contexto).
  const nonTrustAlerts  = jsAlerts.filter(a => a.severity > 0 && !a.isTrust);
  const hasHardSignal   = nonTrustAlerts.some(a => !a.isWeak);

  const signals = nonTrustAlerts
    .filter(a => hasHardSignal || !a.isWeak)  // si solo hay débiles → no mostrar
    .slice(0, 8)
    .map(a => ({
      id:          a.family || a.id || "",
      title:       a.title  || "",
      description: a.display_text || a.why || a.detail || "",
      severity:    a.severity || 0,
      is_positive: false,
    }));

  const trustSignals = jsAlerts
    .filter(a => a.isTrust)
    .map(a => ({
      id:          a.family || a.id || "",
      title:       a.title  || "",
      description: a.display_text || a.why || "",
      severity:    Math.abs(a.severity || 0),
      is_positive: true,
    }));

  // ── Fragmentos de evidencia ───────────────────────────────────────────────
  // Tomar URLs detectadas y los primeros alerts con detail útil
  const evidenceFragments = [];
  if (jsResult.urls && jsResult.urls.length > 0) {
    jsResult.urls.slice(0, 2).forEach(url => {
      evidenceFragments.push({
        text:      url,
        reason:    "URL detectada en el mensaje",
        signal_id: "url_detected",
      });
    });
  }
  // Alertas con detail que no sean solo internos
  const INTERNAL = ["Encontrado:", "Combinación:", "Coincidencias:", "Señal de tipo"];
  jsAlerts
    .filter(a => a.severity >= 16 && !a.isTrust && a.detail &&
                 !INTERNAL.some(p => a.detail.startsWith(p)))
    .slice(0, 2)
    .forEach(a => {
      evidenceFragments.push({
        text:      a.detail.slice(0, 100),
        reason:    a.display_text || a.why || a.title,
        signal_id: a.family || "",
      });
    });

  // ── Output contract ───────────────────────────────────────────────────────
  return {
    // Clasificación
    risk_level:   riskLevel,
    final_score:  finalScore,
    action:       finalScore >= 75 ? "block_alert"
                : finalScore >= 50 ? "warn_strong"
                : finalScore >= 25 ? "warn"
                : "allow",

    // Tipo de amenaza
    threat_category:       threatCategory,
    threat_category_label: threatLabel,
    threat_confidence:     threatConfidence,

    // Explicación
    hint_id: hintId,
    summary: summary,

    // Señales
    signals,
    trust_signals: trustSignals,

    // Fragmentos
    evidence_fragments: evidenceFragments,

    // Recomendaciones (del motor JS, ya calculadas)
    recommendations: jsResult.recommendations || [],

    // Metadatos
    review_needed: reviewNeeded,
    uncertain: mlResult?.uncertain ?? false,

    // Pattern del motor JS (para compatibilidad UI)
    pattern: jsResult.pattern || { label: "Sin patrón detectado", desc: "" },

    // Debug (no mostrar al usuario, útil para desarrollo)
    debug: {
      technical_score: jsScore,
      ml_available:    mlAvail,
      ml_label:        mlResult?.ml_label        || null,
      ml_confidence:   mlResult?.ml_confidence   || null,
      ml_subcategory:  mlResult?.ml_subcategory  || null,
      evidence_gate:   evidenceGate,
      hard_floor:      hardFloor,
      hard_flags:      hardFlags,
      word_count:      wordCount,
    },
  };
}

// ── Export (compatible con browser y Node) ───────────────────────────────────
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeEvidenceGate,
    computeHardFloor,
    computeFinalScore,
    computeReviewNeeded,
    finalRiskLevel,
    combineHybridResult,
  };
}
