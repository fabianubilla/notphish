# NotPhish

Proyecto educativo de ciberseguridad orientado a comprender la detección de phishing mediante análisis basado en reglas y machine learning.

## Demo

https://fabianubilla.github.io/NotPhish/

La demo publicada en GitHub Pages utiliza solo la capa de reglas implementada en JavaScript.

El modelo de machine learning y el sistema híbrido requieren ejecutar `server.py` localmente.

## Resumen

NotPhish es un prototipo de detección de phishing que analiza el contenido de mensajes usando varias capas:

- reglas en JavaScript
- modelo de machine learning
- sistema híbrido que combina ambos resultados

El proyecto nació como una continuación de Social Engineering Scanner, donde exploré las limitaciones de detectar mensajes sospechosos usando solo reglas y palabras clave.

No es una herramienta lista para producción. Es un proyecto educativo creado para entender mejor cómo funcionan estos enfoques, dónde fallan y por qué detectar phishing real es más difícil de lo que parece.

## Objetivo

Con este proyecto quise entender:

- por qué las reglas simples no bastan para detectar phishing
- cómo funciona un detector con varias capas de análisis
- qué hace un modelo de machine learning aplicado a texto
- cómo TF-IDF convierte texto en datos numéricos
- qué problemas aparecen al combinar reglas con machine learning
- qué limitaciones siguen existiendo en un sistema más complejo

## Funciones principales

- detección basada en reglas
- análisis de URLs sospechosas
- detección de señales de ingeniería social
- detección de intentos de robo de códigos OTP
- modelo de machine learning para clasificar textos
- sistema híbrido para combinar reglas y ML
- interfaz web con explicaciones simples para el usuario
- log técnico para revisar qué señales activaron el análisis

## Cómo funciona

NotPhish analiza el mensaje usando tres capas principales.

### Capa 1: reglas en JavaScript

La primera capa revisa señales concretas dentro del texto.

Detecta elementos como:

- dominios que imitan marcas conocidas
- URLs acortadas o con formatos extraños
- solicitudes de códigos OTP
- urgencia
- autoridad
- aislamiento
- promesas de beneficio
- patrones típicos de ingeniería social

Cada señal tiene un peso. Algunas señales son débiles y solo aportan al score. Otras son más fuertes y pueden activar alertas más directas.

Esta capa es fácil de entender y revisar, pero tiene una limitación importante: no comprende realmente el contexto. Un mensaje legítimo puede activar reglas sospechosas y un mensaje fraudulento puede evitar las palabras esperadas.

### Capa 2: modelo de machine learning

La segunda capa usa un modelo entrenado con aproximadamente 46.000 textos reunidos desde datasets públicos relacionados con phishing, scam, newsletters y correos legítimos.

Para este proyecto busqué y revisé datasets que permitieran comparar mensajes fraudulentos con mensajes legítimos. El objetivo no era construir un modelo perfecto, sino entender cómo se comporta un clasificador cuando aprende patrones desde muchos ejemplos reales.

El modelo utilizado es SGD, Stochastic Gradient Descent. No es una red neuronal ni un LLM. Es un modelo lineal que aprende patrones a partir de ejemplos.

Antes de clasificar el texto, el sistema lo convierte en números usando TF-IDF.

TF-IDF ayuda a representar qué palabras son relevantes dentro de un mensaje:

- TF mide qué tan frecuente aparece una palabra en el texto
- IDF reduce el peso de palabras demasiado comunes
- las palabras más distintivas reciben más importancia

El modelo también analiza combinaciones de palabras y variaciones de caracteres. Esto ayuda a detectar expresiones que pueden tener más sentido juntas que por separado.

El modelo fue entrenado principalmente con textos en inglés, por lo que su rendimiento en español latinoamericano es más limitado.

### Capa 3: sistema híbrido

La tercera capa combina el resultado de las reglas con el resultado del modelo de machine learning.

El problema es que ambas capas no siempre coinciden. Las reglas pueden marcar un mensaje como seguro mientras el modelo lo considera sospechoso. También puede pasar lo contrario.

Para controlar esa diferencia, el sistema usa un `evidence gate`. Esta lógica decide cuánta influencia puede tener el modelo según la evidencia disponible.

El objetivo es evitar que el modelo cambie demasiado el resultado cuando el texto es corto, ambiguo o no tiene suficientes señales técnicas.

Este sistema no elimina los errores. Solo intenta hacer que la combinación entre reglas y machine learning sea más controlada.

## Instalación y uso

Clonar el repositorio:

```bash
git clone https://github.com/fabianubilla/notphish.git
cd notphish
```

En macOS:

```bash
pip3 install scikit-learn joblib flask
python3 server.py
```

En Linux:

```bash
pip install scikit-learn joblib flask
python server.py
```

Luego abre `index.html` en el navegador.

También puedes abrir `index.html` directamente sin ejecutar Python. En ese caso solo funcionará la capa de reglas en JavaScript, sin machine learning.

## Estructura del proyecto

```text
notphish/
├── index.html
├── app.js
├── hybrid.js
├── hints.js
├── server.py
├── config.json
└── models/
    ├── primary_model_candidate.joblib
    └── subcategory_model_candidate.joblib
```

## Archivos principales

### `index.html`

Interfaz web del proyecto.

### `app.js`

Motor de reglas en JavaScript.

### `hybrid.js`

Sistema híbrido que combina reglas y machine learning.

### `hints.js`

Textos explicativos para mostrar al usuario.

### `server.py`

Servidor Flask que carga el modelo y responde a las peticiones del frontend.

### `config.json`

Parámetros, umbrales y pesos usados por el sistema.

### `models/`

Modelos entrenados usados por la capa de machine learning.

## Limitaciones

- No es una herramienta lista para producción
- El modelo fue entrenado principalmente con textos en inglés
- El rendimiento en español latinoamericano es más limitado
- Puede generar falsos positivos
- Puede fallar con mensajes muy cortos o ambiguos
- No analiza headers de correo
- No detecta phishing basado en imágenes o códigos QR
- No funciona en tiempo real
- Requiere pegar manualmente el texto a analizar
- Las reglas pueden ser evadidas si alguien conoce cómo funcionan

## Qué aprendí

Este proyecto me ayudó a entender que agregar machine learning no convierte automáticamente un detector en una herramienta confiable.

Las reglas son fáciles de revisar, pero no entienden contexto. El modelo puede encontrar patrones más amplios, pero también puede equivocarse, especialmente con textos ambiguos o en idiomas distintos a los del entrenamiento.

La parte más interesante fue ver que el problema no era solo detectar más señales. También había que decidir qué hacer cuando las distintas capas del sistema no estaban de acuerdo.

NotPhish me permitió entender mejor conceptos como TF-IDF, clasificación de texto, falsos positivos, scoring híbrido y limitaciones prácticas en la detección de phishing.

## Próximo paso

Este proyecto analiza principalmente el contenido del mensaje.

Una capa pendiente sería analizar los headers del correo, donde pueden aparecer señales técnicas relacionadas con el dominio, la ruta del mensaje y los mecanismos de autenticación como SPF, DKIM y DMARC.

## Tecnologías

HTML · CSS · JavaScript · Python · Flask · scikit-learn · TF-IDF · SGD

## Desarrollo asistido por IA

Este proyecto fue desarrollado con apoyo importante de Claude, de Anthropic, especialmente en la escritura del código, la estructura técnica y varias decisiones de implementación.

No presento este repositorio como una herramienta construida íntegramente de forma manual por mí. Lo comparto como un proyecto educativo y como parte de mi proceso real de aprendizaje en ciberseguridad e informática.

Mi rol fue definir qué quería explorar, guiar el enfoque del proyecto, probar el sistema, revisar sus resultados, detectar errores, ajustar ideas, descartar propuestas que no tenían sentido y entender progresivamente cómo se conectaban sus distintas capas: reglas, modelo de machine learning y sistema híbrido.

Trabajar con este proyecto me ayudó a aprender más que solo leer teoría, porque pude probar una herramienta concreta, ver dónde fallaba y entender mejor las limitaciones de la detección de phishing.

## Licencia

MIT