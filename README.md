# ¿Qué pasa cuando las reglas no son suficientes?

En el proyecto anterior, [Social Engineering Scanner](https://github.com/fabianubilla/social-engineering-scanner), trabajé con una idea simple:

> detectar phishing buscando palabras sospechosas.

Ese enfoque sirve para aprender, pero tiene límites claros:

- puede marcar correos legítimos como sospechosos
- puede ser evadido si el atacante cambia las palabras
- no entiende bien el contexto del mensaje

NotPhish nace desde esa pregunta:

> ¿qué pasa si intentamos mejorar el detector combinando reglas simples con Machine Learning?

---

# NotPhish

NotPhish es un proyecto educativo para entender cómo puede evolucionar un detector de phishing cuando deja de depender solamente de palabras clave.

Combina tres partes principales:

1. reglas en JavaScript
2. un modelo de ML (Machine Learning)
3. una capa híbrida que intenta unir ambas respuestas

La idea no es llegar a un detector perfecto.

La idea es ver qué mejora al agregar más capas,
qué sigue fallando y por qué detectar phishing real no es tan simple como parece.

---

## Qué vamos a aprender

- Por qué las reglas simples no bastan siempre
- Cómo funciona un detector con varias capas
- Qué hace un modelo de ML aplicado a texto
- Qué significa convertir texto en números usando TF-IDF
- Por qué combinar reglas y ML no es tan directo
- Qué límites siguen existiendo incluso con un sistema más avanzado

---

## Capturas

Algunas vistas de la interfaz en funcionamiento:

<p align="center">
  <img src="screenshots/inicio.png" width="200"/>
  <img src="screenshots/critico.png" width="200"/>
  <img src="screenshots/analizado.png" width="200"/>
  <img src="screenshots/limpio.png" width="200"/>
</p>

---

## La interfaz

La interfaz intenta mostrar el resultado en lenguaje simple.

No se queda solo en:

```text
riesgo alto
```

o

```text
riesgo bajo
```

También muestra qué señales encontró el sistema y qué acción segura podría tomar la persona.

La idea es que el análisis sea más fácil de entender,
incluso para usuarios que no manejan conceptos técnicos de ciberseguridad.

---

# Cómo usarlo

Primero clona el repositorio:

```bash
git clone https://github.com/fabianubilla/notphish.git
cd notphish
```

Luego instala las dependencias y levanta el servidor.

## En macOS

```bash
pip3 install scikit-learn joblib flask
python3 server.py
```

## En Linux

```bash
pip install scikit-learn joblib flask
python server.py
```

Luego abre `index.html` en el navegador.

También puedes abrir `index.html` directamente sin Python,
pero en ese caso solo funcionará la capa de reglas en JavaScript.

> En macOS, los comandos `pip` y `python` pueden no estar disponibles por defecto.
> Por eso se usan `pip3` y `python3`.

---

# Por qué hacen falta varias capas

En el scanner anterior, la lógica era muy simple:

```text
buscar palabra sospechosa → sumar puntaje → mostrar alerta
```

Eso sirve para entender la base.

Pero en mensajes reales aparecen problemas:

- una palabra urgente puede aparecer en un correo legítimo
- un phishing puede no usar palabras obvias
- un enlace puede parecer normal, pero apuntar a otro dominio
- un mensaje puede manipular sin tener frases típicas de estafa

Entonces aparece la necesidad de mirar más señales.

NotPhish prueba ese camino:

```text
reglas visibles → patrones aprendidos → combinación de señales
```

---

# Cómo funciona por dentro

NotPhish combina tres capas:

```text
reglas JS → modelo ML → sistema híbrido
```

Cada capa ayuda en algo, pero ninguna arregla todo.

---

## Capa 1 — Motor de reglas

La primera capa está en `app.js`.

Es la parte más parecida al scanner:
busca señales sospechosas dentro del texto.

La diferencia es que ahora no todas las señales valen lo mismo.

Por ejemplo:

- una palabra urgente puede ser una señal débil
- un enlace extraño puede ser una señal más fuerte
- un dominio que imita a una marca conocida puede ser una señal crítica

---

### Qué detecta esta capa

- Dominios que imitan marcas conocidas  
  Ejemplo: `banco-santander-seguro.xyz`

- URLs acortadas  
  Ejemplo: `bit.ly`

- URLs ofuscadas  
  Ejemplo: `hxxps://`

- Pedidos de OTP  
  OTP (One-Time Password) significa código de un solo uso, como los códigos que llegan por SMS o app bancaria.

- Patrones de CEO Fraud  
  Fraude donde alguien se hace pasar por un jefe o autoridad para pedir una acción urgente.

- Señales de ingeniería social  
  Urgencia, autoridad, beneficio, bloqueo o presión.

---

### Qué mejora respecto al scanner

El scanner trataba muchas señales como si fueran parecidas.

NotPhish intenta separar señales débiles de señales más fuertes.

Una palabra aislada no debería pesar lo mismo que un dominio falso,
un pedido de código OTP o una combinación de urgencia + transferencia + silencio.

---

### Dónde falla

Las reglas siguen teniendo el mismo problema de fondo:

no entienden completamente el contexto.

Un mensaje puede no tener enlaces raros ni palabras típicas,
y aun así ser manipulación.

También puede pasar lo contrario:

un mensaje legítimo puede usar palabras como “urgente”, “cuenta” o “verificación”
y activar alertas innecesarias.

Por eso aparece la segunda capa.

---

## Capa 2 — Modelo de Machine Learning

La segunda capa usa un modelo de ML (Machine Learning).

La idea es que el sistema no dependa solo de reglas escritas a mano,
sino que también pueda aprender patrones desde ejemplos.

El modelo fue entrenado con textos clasificados como legítimos o sospechosos.

No “entiende” como una persona,
pero puede aprender que ciertas combinaciones de palabras aparecen más
en mensajes fraudulentos que en mensajes normales.

---

### Qué modelo usa

El modelo principal usa SGD (Stochastic Gradient Descent).

Dicho simple:

es un modelo lineal que aprende ajustando pesos internos.

No es una red neuronal.
No es un LLM.
No razona el mensaje.

Aprende patrones estadísticos desde los datos de entrenamiento.

---

### Qué es TF-IDF

Un modelo no puede trabajar directamente con texto como lo hacemos nosotros.

Primero necesita convertir ese texto en números.

Para eso se usa TF-IDF (Term Frequency–Inverse Document Frequency).

La idea básica es esta:

- si una palabra aparece mucho en un mensaje, puede ser importante
- pero si aparece en todos los mensajes, probablemente no dice mucho
- si una palabra o expresión aparece en ciertos mensajes sospechosos, puede tener más peso

Por ejemplo, palabras muy comunes como:

```text
el
de
que
para
```

aportan poco.

Pero expresiones como:

```text
verifica tu cuenta
expira hoy
código de seguridad
```

pueden aportar más información.

TF-IDF ayuda a transformar texto en números útiles para que el modelo pueda clasificar.

---

### Qué son los n-grams

El modelo también puede mirar grupos de palabras o caracteres.

Eso se llama n-grams.

Un n-gram es una secuencia de elementos.

Por ejemplo:

```text
expira hoy
verifica cuenta
código seguridad
```

puede decir más que mirar cada palabra por separado.

También existen n-grams de caracteres.

Eso sirve para detectar pequeñas variaciones dentro de palabras,
como cuando alguien escribe algo de forma rara para evadir filtros.

Por ejemplo:

```text
urgente
urgentee
urg3nte
```

---

### Qué mejora respecto a las reglas

Las reglas detectan lo que alguien escribió manualmente.

El modelo puede encontrar patrones que no escribimos uno por uno.

Eso permite detectar mensajes donde no aparece una palabra exacta,
pero sí una combinación de elementos parecida a otros casos sospechosos.

---

### Dónde falla

El ML también se equivoca.

Puede marcar como sospechoso un texto legítimo
solo porque se parece estadísticamente a mensajes fraudulentos del dataset.

También puede fallar si:

- el mensaje es muy corto
- el idioma cambia
- el contexto cultural es distinto
- el caso no se parece a los ejemplos de entrenamiento

En este proyecto, una limitación importante es que el modelo fue entrenado principalmente con datos en inglés.

Eso significa que su rendimiento en español puede ser más débil.

Por eso no conviene dejar que el modelo decida solo.

---

## Capa 3 — Sistema híbrido

La tercera capa está en `hybrid.js`.

Aquí aparece una pregunta importante:

> ¿qué pasa si las reglas dicen una cosa y el modelo dice otra?

Por ejemplo:

- las reglas pueden ver pocas señales
- el modelo puede encontrar patrones sospechosos
- o el modelo puede exagerar el riesgo en un mensaje legítimo

Entonces no basta con sumar todo y listo.

Hay que decidir cuánto peso darle a cada parte.

---

### Evidence gate

Para eso existe el evidence gate.

Evidence gate significa algo así como “compuerta de evidencia”.

Es una parte del sistema que decide cuánta influencia puede tener el modelo de ML
según las señales disponibles.

Por ejemplo:

- si el texto es muy corto, el ML puede quedar limitado
- si no hay señales claras, el ML no debería disparar una alerta fuerte por sí solo
- si las reglas encuentran señales importantes, el ML puede aportar más
- si hay señales de legitimidad, el sistema puede ser más cuidadoso

La idea es evitar que el modelo cambie demasiado el resultado
cuando no hay suficiente evidencia.

---

### Dónde falla

Combinar reglas y ML no significa automáticamente tener un mejor detector.

Puede mejorar algunas cosas,
pero también puede traer problemas nuevos:

- más falsos positivos
- exceso de confianza en el modelo
- errores por idioma
- errores por mensajes demasiado cortos
- conflictos entre señales

El sistema híbrido intenta equilibrar ambas capas.

No lo hace perfecto.

Pero sirve para entender por qué combinar señales es más difícil
que simplemente sumar resultados.

---

# Resumen del flujo

Una forma simple de entender NotPhish es esta:

```text
1. Las reglas buscan señales visibles.
2. El modelo ML busca patrones aprendidos en el texto.
3. El sistema híbrido decide cuánto peso darle a cada parte.
4. La interfaz muestra el resultado en lenguaje simple.
```

El objetivo es ver cómo un detector puede pasar de una lógica simple
a una lógica más parecida a la que usan sistemas reales:
mirar varias señales antes de decidir.

---

# Limitaciones conocidas

NotPhish sigue teniendo límites importantes.

- Puede generar falsos positivos en mensajes legítimos con lenguaje agresivo o comercial.
- El rendimiento en español puede ser menor porque el modelo fue entrenado principalmente con datos en inglés.
- No analiza imágenes, capturas ni códigos QR.
- No analiza archivos adjuntos.
- No revisa headers reales del correo.
- No verifica en tiempo real si un dominio existe o si está activo.
- Puede ser evadido si alguien conoce bien las reglas.

Estas limitaciones no hacen que el proyecto pierda valor.

Al contrario:
ayudan a entender por qué la detección real de phishing necesita varias capas
y por qué ningún enfoque aislado resuelve todo.

---

# Qué no analiza todavía

NotPhish analiza principalmente el contenido del mensaje.

No analiza todavía los headers del correo,
que son los metadatos técnicos donde aparecen cosas como:

- servidores por los que pasó el mensaje
- dominio real de envío
- autenticación SPF / DKIM / DMARC
- firmas digitales
- rutas de entrega

SPF, DKIM y DMARC son mecanismos usados para verificar
si un correo realmente viene del dominio que dice representar.

Esa sería otra capa distinta de análisis,
más cercana al análisis técnico o forense del correo.

---

# Cómo leer el código si eres estudiante

Este orden puede ayudar a entender el proyecto sin perderse:

1. **`config.json`**  
   Contiene umbrales y parámetros.  
   Es un buen punto de entrada porque muestra qué valores afectan las decisiones del sistema.

2. **`app.js`**  
   Contiene el motor de reglas.  
   Es la parte más parecida al scanner, pero con más señales y pesos.

3. **`hybrid.js`**  
   Contiene la lógica para combinar reglas y ML.  
   Conviene mirar primero `computeEvidenceGate()` y después `computeFinalScore()`.

4. **`server.py`**  
   Carga el modelo y responde las solicitudes desde la interfaz.  
   Es el puente entre Python y la parte web.

5. **`index.html`**  
   Contiene la interfaz.  
   Muestra el análisis de forma visual y más fácil de leer.

---

# Estructura del proyecto

```text
notphish/
├── index.html       # Interfaz web
├── app.js           # Motor de reglas JS
├── hybrid.js        # Sistema híbrido: evidence gate y fusión JS + ML
├── hints.js         # Textos educativos por tipo de amenaza
├── server.py        # Servidor Flask para el modelo ML
├── config.json      # Umbrales y parámetros
└── models/
    ├── primary_model_candidate.joblib
    └── subcategory_model_candidate.joblib
```

---

# Proyecto anterior

## [¿Se puede detectar phishing solo buscando palabras sospechosas?](https://github.com/fabianubilla/social-engineering-scanner)

Ese proyecto es el punto de partida.

Muestra cómo funcionan las reglas simples,
por qué sirven para aprender y por qué no bastan para detectar phishing real.

NotPhish continúa desde ahí.

---

# Tecnologías

- HTML
- CSS
- JavaScript vanilla
- Python
- Flask
- scikit-learn
- joblib
- TF-IDF
- SGD

---

# Sobre este proyecto

Soy estudiante de ingeniería informática y ciberseguridad. A la fecha de este proyecto, mis conocimientos de programación están en una etapa inicial: fundamentos, lógica y exploración práctica.

Este proyecto fue construido usando Claude (Anthropic) como herramienta de desarrollo y aprendizaje. La IA tuvo un rol importante en la implementación, en decisiones técnicas y en la generación del código.

Mi rol fue definir qué quería explorar, probar el sistema, revisar resultados, descartar ideas que no tenían sentido y entender progresivamente cómo funcionaban las capas del detector.

Lo comparto porque construir algo concreto me ayudó mucho más que solo leer teoría, y quizás también le sirva a otros estudiantes que estén empezando.

---

# Licencia

MIT
