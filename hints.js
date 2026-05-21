/**
 * hints.js — NotPhish Hybrid Engine v3
 * Sistema de explanation_hint con validación de evidencia.
 *
 * REGLA FUNDAMENTAL:
 * Un hint solo se activa si hay evidencia real en el texto.
 * El motor JS aporta la evidencia. El ML aporta el tipo.
 * Nunca inventar evidencia que no está en el texto.
 */

// ── Plantillas de summary por hint ───────────────────────────────────────────
const HINT_TEMPLATES = {
  // ── AMENAZAS ──────────────────────────────────────────────────────────────
  otp_theft_confirmed:
    "Alguien intenta que compartas tu código de verificación — eso le daría control de tu cuenta.",
  brand_phishing:
    "El enlace imita a una marca conocida, pero el dominio no pertenece a esa empresa.",
  credential_phishing:
    "El mensaje pide credenciales a través de un enlace o dominio sospechoso.",
  fake_delivery:
    "Falsa notificación de entrega: pretexto para que pagues o entregues datos.",
  bec_transfer:
    "El mensaje pide una transferencia urgente y pide no verificarlo — patrón de fraude corporativo.",
  fake_job_offer:
    "La oferta de empleo tiene señales de fraude: cobro previo, email genérico o promesas irreales.",
  tech_support_scam:
    "El mensaje simula ser soporte técnico para que llames a un número o instales algo.",
  advance_fee_scam:
    "Usa urgencia o historia emocional para pedir dinero o acción inmediata.",
  spear_phishing_targeted:
    "El mensaje parece dirigido específicamente a ti para ganar tu confianza antes de pedir algo.",
  data_request_no_tech:
    "Alguien que dice ser de una institución pide datos sensibles directamente por mensaje.",
  suspicious_link:
    "El enlace tiene características asociadas a sitios de phishing.",
  generic_scam:
    "El mensaje tiene múltiples señales de fraude. No interactúes sin verificar la fuente.",

  // ── LEGÍTIMOS ─────────────────────────────────────────────────────────────
  otp_legit_aviso:
    "El mensaje incluye un aviso explícito de no compartir el código — señal positiva de legitimidad.",
  newsletter_confirmed:
    "Es un correo de suscripción legítima con opción de darse de baja.",
  bank_notification_legit:
    "Parece una notificación informativa de banco, sin solicitar acción urgente.",
  educational_notice:
    "Comunicación educativa o informativa sin señales de riesgo detectadas.",
  internal_comms:
    "Comunicación interna de empresa sin señales técnicas de alerta.",

  // ── INCERTIDUMBRE ─────────────────────────────────────────────────────────
  mixed_signals:
    "El mensaje tiene características mixtas. Verifica por un canal oficial antes de actuar.",
  semantic_scam_no_evidence:
    "El lenguaje parece sospechoso pero no encontramos evidencia técnica clara. Verifica la fuente.",
  review_needed_conflict:
    "Las señales son contradictorias. Verifica directamente con la institución antes de actuar.",
  insufficient_evidence:
    "No detectamos señales suficientes para concluir. Si tienes dudas, verifica por otro canal.",
  text_too_short:
    "El texto es demasiado corto para analizar con certeza.",
};

// ── Etiquetas visibles para threat_category ───────────────────────────────────
const SUBCAT_LABELS = {
  phishing_generic:  "Phishing",
  spear_phishing:    "Spear Phishing",
  fake_job:          "Empleo falso",
  tech_support:      "Soporte técnico falso",
  advance_fee:       "Estafa de adelanto",
  other_scam:        "Fraude",
};

// ── Función de selección de hint ──────────────────────────────────────────────
/**
 * Selecciona el hint más apropiado dado el resultado híbrido.
 *
 * @param {object} jsResult   - Resultado del motor JS (analyze())
 * @param {object} mlResult   - Resultado del servidor ML
 * @param {object} hybrid     - Datos calculados por hybrid.js
 * @returns {string} hint_id
 */
function selectHint(jsResult, mlResult, hybrid) {
  const alerts      = jsResult.alerts || [];
  const hardFlags   = hybrid.hard_flags || [];
  const trustSigs   = alerts.filter(a => a.isTrust);
  const evidenceGate = hybrid.evidence_gate;
  const finalScore  = hybrid.final_score;

  const mlLabel    = mlResult?.ml_label || null;
  const mlConf     = mlResult?.ml_confidence || 0;
  const mlSub      = mlResult?.ml_subcategory || "unknown";
  const uncertain  = mlResult?.uncertain ?? true;
  const mlAvail    = mlResult?.ml_available ?? false;
  const reviewNeeded = hybrid.review_needed;

  // Helpers para detectar evidencia real en alertas JS
  const hasFamily  = (...fams) => alerts.some(a => !a.isTrust && fams.includes(a.family));
  const hasCat     = (cat)     => alerts.some(a => !a.isTrust && a.category === cat);
  const hasUrl     = jsResult.urls && jsResult.urls.length > 0;

  // ── Prioridad 1: Hard flags técnicos ──────────────────────────────────────
  if (hardFlags.includes("otp_mfa_scam") || hasFamily("otp_mfa_scam", "otp_theft"))
    return "otp_theft_confirmed";

  if (hardFlags.includes("brand_domain_spoof") || hasFamily("brand_domain_spoof", "brand_link_spoof"))
    return "brand_phishing";

  if (hardFlags.includes("boss_impersonation") || hasFamily("boss_impersonation", "bec_bank_change", "two_stage_bec"))
    return "bec_transfer";

  if (hardFlags.includes("delivery_scam") || hasFamily("delivery_action_combo", "delivery_courier_scam"))
    return "fake_delivery";

  if (hasFamily("direct_data_harvest"))
    return "data_request_no_tech";

  // ── Prioridad 2: Combinaciones técnicas con URL ────────────────────────────
  if (hasUrl && hasFamily("credential", "phishing_credential_urgency"))
    return "credential_phishing";

  if (hasUrl && (hasCat("Entrega o courier") || hasFamily("delivery_action_combo")))
    return "fake_delivery";

  if (hasUrl && hasFamily("brand_content_spoof", "lookalike_domain", "misleading_subdomain"))
    return "brand_phishing";

  if (hasUrl && hasFamily("suspicious_domain", "infra_abuse", "url_shortener"))
    return "suspicious_link";

  // ── Prioridad 3: ML con señales JS de apoyo ────────────────────────────────
  if (mlAvail && mlLabel === "scam" && !uncertain) {
    if (mlSub === "spear_phishing" && mlConf >= 0.65)
      return "spear_phishing_targeted";
    if (mlSub === "fake_job" && mlConf >= 0.60)
      return "fake_job_offer";
    if (mlSub === "tech_support" && mlConf >= 0.60)
      return "tech_support_scam";
    if (mlSub === "advance_fee" && mlConf >= 0.60)
      return "advance_fee_scam";
    if (evidenceGate === "open" && mlConf >= 0.65)
      return "generic_scam";
    // Nuevo: gate=semantic → ML detectó scam sin infraestructura técnica visible
    if ((evidenceGate === "semantic" || evidenceGate === "partial") && mlConf >= 0.75)
      return "semantic_scam_no_evidence";
  }

  // ── Prioridad 4: Señales legítimas ────────────────────────────────────────
  const hasOtpLegit = trustSigs.some(t =>
    ["legit_otp_warning", "otp_legit_warning", "trust_otp"].includes(t.family || t.id)
  );
  if (hasOtpLegit) return "otp_legit_aviso";

  const hasNewsletter = trustSigs.some(t =>
    ["legit_newsletter", "trust_newsletter", "legit_reportage"].includes(t.family || t.id)
  );
  if (hasNewsletter) return "newsletter_confirmed";

  if (mlAvail && mlLabel === "legit" && mlConf >= 0.75) {
    const hasUrgency = hasFamily("urgency", "threat");
    if (!hasUrgency && !hasUrl) return "educational_notice";
    if (hasCat("Contexto legítimo")) return "bank_notification_legit";
  }

  // ── Prioridad 5: Incertidumbre ────────────────────────────────────────────
  if (hybrid.evidence_gate === "blocked") return "text_too_short";
  if (reviewNeeded) return "review_needed_conflict";
  if (uncertain && finalScore <= 10) return "insufficient_evidence";
  if (uncertain || hybrid.contradicts_js) return "mixed_signals";

  // ── Fallback ───────────────────────────────────────────────────────────────
  if (finalScore >= 50) return "generic_scam";
  return "insufficient_evidence";
}

/**
 * Devuelve el texto visible para el usuario dado un hint_id.
 * Siempre desde plantilla controlada — nunca generado por ML.
 */
function getHintSummary(hintId) {
  return HINT_TEMPLATES[hintId] ||
    "El mensaje tiene características que merecen atención. Verifica antes de actuar.";
}

/**
 * Devuelve la etiqueta visible de la categoría de amenaza.
 */
function getThreatCategoryLabel(subcategory) {
  return SUBCAT_LABELS[subcategory] || null;
}

// Exportar para uso en app.js (compatible con browser y Node)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { selectHint, getHintSummary, getThreatCategoryLabel, HINT_TEMPLATES };
}
