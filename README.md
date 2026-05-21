# NotPhish

Proyecto de aprendizaje sobre detección de phishing.

---

## Cómo fue construido — y por qué importa decirlo

Soy estudiante de ingeniería informática y ciberseguridad. A la fecha de este proyecto,
mis conocimientos de programación todavía son básicos: fundamentos, lógica y exploración.

Este proyecto fue construido usando Claude (Anthropic) como herramienta de desarrollo.
La IA tuvo un rol importante en la implementación, en muchas decisiones técnicas y en
la generación del código.

Mi rol fue definir qué quería explorar, iterar ideas, evaluar propuestas, descartar
cosas que no tenían sentido para mí y aprender progresivamente cómo funcionaba el sistema.

No publico este proyecto como algo hecho "100% a mano" ni como un producto profesional.
Lo publico como parte de un proceso real de aprendizaje y exploración técnica.

Creo que hoy aprender también implica saber trabajar con herramientas de IA,
pero entendiendo sus límites y siendo transparente sobre cómo se usaron.

---

## Capturas

<p align="center">
  <img src="screenshots/inicio.png" width="200"/>
  <img src="screenshots/critico.png" width="200"/>
  <img src="screenshots/analizado.png" width="200"/>
  <img src="screenshots/limpio.png" width="200"/>
</p>

---

## Por qué existe

Empecé con una pregunta simple:

> **¿cómo sabe un programa que un mensaje es una estafa?**

Primero construí [`social-engineering-scanner`](https://github.com/fivur-cs/social-engineering-scanner),
un script Bash basado en palabras clave y reglas simples.

Funcionaba para casos obvios, pero tenía falsos positivos altos y se evadía con facilidad.

NotPhish nació para explorar qué ocurre cuando intentas ir más allá de reglas fijas:
mezclar señales técnicas, contexto semántico y distintas capas de análisis.

---

## Para quién es la interfaz

La interfaz fue pensada para personas con baja alfabetización digital:
lenguaje simple, sin tecnicismos innecesarios y enfocada en explicar
qué encontró el análisis y qué hacer después.

Especialmente pensé en adultos mayores y personas que suelen enfrentarse
a este tipo de mensajes sin conocimientos técnicos.

---

## Qué hace

- Analiza texto libre: correos, SMS, WhatsApp, etc.
- Detecta señales técnicas y semánticas de manipulación
- Entrega un score de riesgo de 0 a 100
- Explica el resultado en lenguaje simple
- Recomienda acciones según el nivel de riesgo
- Todo ocurre localmente — el texto no sale del equipo

---

## Cómo funciona por dentro

Entiendo esta arquitectura principalmente a nivel conceptual y de funcionamiento general,
no al nivel de poder reconstruir todo el proyecto desde cero sin ayuda.

El sistema tiene tres capas principales.

---

### Capa 1 — Motor de reglas JavaScript (`app.js`)

Busca señales técnicas concretas:

- dominios sospechosos
- URLs acortadas u ofuscadas
- pedidos de OTP
- patrones de fraude corporativo (BEC)
- señales clásicas de ingeniería social

Cada señal tiene un peso numérico y el score final se limita a 100.

---

### Capa 2 — Modelo de machine learning (`server.py` + `models/`)

La capa ML intenta detectar patrones semánticos que las reglas tradicionales no capturan.

El modelo fue entrenado sobre miles de textos legítimos y maliciosos usando TF-IDF
y un clasificador lineal.

Devuelve una probabilidad de riesgo que luego se combina con la capa JS.

---

### Capa 3 — Sistema híbrido (`hybrid.js`)

La parte más interesante del proyecto fue explorar cómo combinar reglas y ML.

El sistema usa un "evidence gate", que decide cuánto puede influir el ML
según la cantidad y calidad de señales disponibles.

La idea principal era evitar falsos positivos absurdos en textos cortos o ambiguos.

---

## Limitaciones conocidas

- Falsos positivos en marketing agresivo
- Rendimiento peor en español LATAM que en inglés
- No detecta phishing por imágenes o QR
- No funciona en tiempo real
- Requiere Python para la capa ML
- El bypass sigue siendo posible

---

## Instalación

```bash
git clone https://github.com/fivur-cs/notphish.git
cd notphish
pip install scikit-learn joblib flask
python server.py
```

Luego abre `index.html` en el navegador.

Sin Python, funciona solo la capa JS.

---

## Estructura

```
notphish/
├── index.html
├── app.js
├── hybrid.js
├── hints.js
├── server.py
├── config.json
└── models/
```

---

## El punto de partida

[`social-engineering-scanner`](https://github.com/fivur-cs/social-engineering-scanner)
fue el proyecto anterior y representa una aproximación mucho más simple:
detección basada en palabras y reglas fijas.

La diferencia entre ambos proyectos muestra precisamente qué problemas
intenta resolver cada nueva capa.

---

## Roadmap

- [ ] Extensión para navegador
- [ ] OCR para imágenes
- [ ] Más entrenamiento en español LATAM
- [ ] Versión móvil
- [ ] Mejoras en explicabilidad

---

## Tecnologías

HTML · CSS · JavaScript · Python · scikit-learn · Flask · TF-IDF

---

## Licencia

MIT

---

*fivur — estudiante de ingeniería informática y ciberseguridad*
