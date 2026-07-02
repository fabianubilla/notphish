# NotPhish

## ¿Qué pasa cuando las reglas no son suficientes?

Después de construir el [social-engineering-scanner](https://github.com/fabianubilla/social-engineering-scanner), me quedó claro que buscar palabras sospechosas servía para algunos casos, pero fallaba apenas cambiaba el contexto.

El scanner podía marcar correos legítimos como fraude y dejar pasar estafas que no usaban las palabras esperadas.

La pregunta que me quedó fue:

> ¿Qué pasa si en vez de solo buscar palabras, le enseñamos al sistema a reconocer patrones?

Este proyecto intenta responder eso combinando reglas con machine learning.

NotPhish nació como el siguiente paso del scanner.

---

## Qué quise entender

Con este proyecto quise entender:

- por qué las reglas solas no bastan;
- cómo funciona un detector con varias capas;
- qué hace un modelo de machine learning aplicado a texto;
- qué es TF-IDF y cómo convierte texto en números;
- por qué combinar reglas y ML es más difícil de lo que parece;
- qué límites siguen existiendo incluso con un sistema más complejo.

No intenté construir una herramienta lista para producción. La idea fue tomar los problemas que habían aparecido en el scanner y probar qué ocurría al agregar nuevas capas de análisis.

---

## La interfaz

La interfaz está pensada para personas con baja alfabetización digital, especialmente adultos mayores.

No muestra solo “riesgo alto” o “riesgo bajo”. También explica qué encontró el análisis y qué puede hacer la persona con esa información, usando un lenguaje sencillo.

---

## Capturas

<p align="center">
  <img src="screenshots/inicio.png" width="200"/>
  <img src="screenshots/critico.png" width="200"/>
  <img src="screenshots/analizado.png" width="200"/>
  <img src="screenshots/limpio.png" width="200"/>
</p>

---

## Cómo usarlo

```bash
git clone https://github.com/fabianubilla/notphish.git
cd notphish
```

**En macOS:**

```bash
pip3 install scikit-learn joblib flask
python3 server.py
```

**En Linux:**

```bash
pip install scikit-learn joblib flask
python server.py
```

Luego abre `index.html` en el navegador.

> Sin Python, puedes abrir `index.html` directamente. En ese caso solo funcionará la capa de reglas de JavaScript, sin machine learning.

> En macOS, `pip` y `python` pueden no estar disponibles por defecto. Usa `pip3` y `python3`.

---

## Por qué hacen falta varias capas

En el scanner, la lógica era directa:

```text
buscar palabra → sumar punto → mostrar alerta
```

Eso funcionaba en algunos casos, pero al probarlo con mensajes diferentes aparecieron problemas que las reglas simples no podían resolver:

- una palabra urgente puede aparecer en un correo legítimo;
- un phishing puede no utilizar palabras obvias;
- un enlace puede parecer normal, pero apuntar a otro dominio;
- dos mensajes parecidos pueden tener intenciones completamente distintas.

NotPhish intenta mirar más señales al mismo tiempo:

```text
reglas JS → modelo ML → sistema híbrido → resultado
```

Agregar más capas no elimina todos los errores, pero permite analizar el mensaje desde perspectivas diferentes.

---

## Cómo funciona por dentro

### Capa 1 — Motor de reglas (`app.js`)

Es la parte más parecida al scanner, pero con más señales y una estructura más compleja.

No todas las señales valen lo mismo. Hay señales débiles, que no bastan por sí solas, y señales duras, que activan una alerta porque indican un riesgo más directo.

Detecta:

- dominios que imitan marcas conocidas (`banco-santander-seguro.xyz`);
- URLs acortadas (`bit.ly`) o con formatos extraños (`hxxps://`);
- pedidos de OTP, cuando alguien solicita el código que llegó al celular;
- patrones de CEO Fraud, como urgencia, silencio y transferencias;
- señales clásicas de ingeniería social.

Cada señal tiene un peso. El total se capea en 100, por lo que si se activan señales que suman 270 puntos, el resultado sigue siendo 100.

El log técnico muestra los pesos individuales para que se pueda revisar qué activó cada parte del análisis.

Las reglas siguen teniendo el mismo problema de fondo que aparecía en el scanner: no entienden realmente el contexto. Un mensaje puede no activar ninguna señal técnica y aun así ser una estafa.

---

### Capa 2 — Modelo de ML (`server.py` + `models/`)

El proyecto utiliza un clasificador entrenado con aproximadamente 46.000 textos: phishing, scam, newsletters y correos legítimos.

El modelo es SGD, Stochastic Gradient Descent. No es una red neuronal ni un LLM. Es un modelo lineal que aprende qué combinaciones de palabras aparecen con más frecuencia en mensajes fraudulentos o legítimos.

Para que el modelo pueda procesar texto, primero hay que convertirlo en números. Para eso utiliza TF-IDF:

- **TF** indica qué tan seguido aparece una palabra dentro del mensaje;
- **IDF** indica qué tan rara es esa palabra dentro del conjunto completo de textos.

Si una palabra aparece muchas veces en un mensaje, pero es poco frecuente en el resto del dataset, recibe un peso mayor. Si aparece prácticamente en todos los textos, como “el”, “de” o “que”, su peso es menor.

El modelo también analiza pares de palabras, porque “expira hoy” puede aportar más información que analizar “expira” y “hoy” por separado. Además, utiliza variaciones de caracteres para reconocer formas como “urgente”, “urgentee” o “urg3nte”.

El modelo fue entrenado principalmente con textos en inglés. Por eso su rendimiento en español latinoamericano es menor y también puede equivocarse con mensajes cortos o ambiguos.

---

### Capa 3 — Sistema híbrido (`hybrid.js`)

Aquí apareció uno de los problemas más interesantes del proyecto.

Las reglas de JavaScript y el modelo de machine learning no siempre están de acuerdo. Las reglas pueden considerar un mensaje limpio mientras el modelo lo marca como sospechoso, o puede ocurrir exactamente lo contrario.

La pregunta entonces pasa a ser:

> ¿A cuál de las dos capas hay que hacerle caso?

Si el modelo puede modificar libremente el score, podría marcar como peligroso un mensaje corto y ambiguo solo porque estadísticamente se parece a ciertos ejemplos del dataset.

Para controlar eso existe el **evidence gate**, que decide cuánta influencia puede tener el modelo según las señales disponibles:

```text
blocked  → el texto es muy corto o no hay evidencia suficiente; el ML no actúa
partial  → existen señales de legitimidad; el ML solo puede bajar el score
semantic → no hay señales técnicas; el ML puede subir levemente si está muy seguro
open     → hay señales JS activas; el ML puede subir o bajar el resultado
```

No es una solución perfecta. Es una decisión de diseño que también puede producir errores, pero evita que el resultado del modelo cambie completamente el análisis sin tener evidencia suficiente.

---

## Limitaciones conocidas

- falsos positivos cercanos al 7 % en correos de marketing legítimo agresivo;
- tasa de falsos positivos en español cercana al 9,6 %, frente a aproximadamente 2,3 % en inglés;
- no detecta phishing mediante imágenes o códigos QR;
- no analiza los headers del correo;
- no funciona en tiempo real, porque analiza textos pegados manualmente;
- sigue siendo posible evadir las reglas si alguien conoce cómo funcionan.

Agregar machine learning no hace que el sistema deje de equivocarse. Las limitaciones siguen existiendo y algunas incluso se vuelven más difíciles de comprender, porque ya no dependen únicamente de una lista visible de palabras.

Esas limitaciones fueron parte importante del proyecto, porque me permitieron ver que hacer un detector más complejo no significa convertirlo automáticamente en un detector confiable.

---

## Cómo fui entendiendo el código

Como el proyecto tiene varias capas, fui recorriendo el código desde las partes más simples hacia las más complejas.

1. **`config.json`**

   Empecé por este archivo porque contiene parámetros con nombres como `mlBoostMax` o `hardFloorOtp`. Aunque al principio no entendiera toda la lógica, los nombres me permitían deducir qué partes del sistema podían controlar.

2. **`app.js`**

   Es la parte más cercana al scanner. La sección marcada como `SECCIÓN 1` contiene las señales individuales, sus pesos y si se consideran débiles o duras.

   La `SECCIÓN 2` muestra cómo el sistema combina distintas señales para reconocer patrones más completos.

3. **`hybrid.js`**

   Las dos funciones principales para entender esta capa fueron `computeEvidenceGate()` y `computeFinalScore()`.

   La primera decide cuánto puede influir el modelo. La segunda combina el resultado de las reglas con el resultado del machine learning.

4. **`server.py`**

   Este archivo carga el modelo utilizando `joblib` y recibe las peticiones enviadas desde la interfaz.

   Me permitió entender de forma básica cómo el frontend podía enviar un texto a Python y recibir una predicción.

5. **`index.html`**

   Aquí se conecta el resultado del análisis con lo que finalmente ve la persona en la pantalla.

---

## Estructura

```text
notphish/
├── index.html       # Interfaz web
├── app.js           # Motor de reglas JS
├── hybrid.js        # Sistema híbrido: evidence gate y fusión JS + ML
├── hints.js         # Textos explicativos por tipo de amenaza
├── server.py        # Servidor Flask para el modelo ML
├── config.json      # Umbrales y parámetros
└── models/
    ├── primary_model_candidate.joblib
    └── subcategory_model_candidate.joblib
```

---

## Qué aprendí con este proyecto

El scanner me había mostrado que las reglas podían funcionar en casos obvios, pero fallaban cuando cambiaba la forma de escribir el mensaje.

Con NotPhish, el problema dejó de ser solamente detectar más señales. También había que decidir qué hacer cuando las distintas capas del sistema no estaban de acuerdo.

Trabajar con este proyecto me permitió entender un poco mejor qué hace TF-IDF, cómo un modelo puede convertir texto en números y por qué combinar reglas con machine learning requiere tomar decisiones que también pueden producir errores.

También entendí que agregar ML no resuelve automáticamente los problemas del detector. Siguen existiendo falsos positivos, diferencias importantes entre idiomas, textos ambiguos y formas de evasión.

El proyecto terminó siendo menos una respuesta definitiva al problema del phishing y más una forma de entender por qué resolverlo es bastante más difícil de lo que parecía al principio.

---

## El siguiente paso

Este proyecto analiza principalmente el contenido del mensaje.

Queda pendiente otra capa: los headers del correo, que contienen información sobre los servidores por los que pasó el mensaje, el dominio utilizado y sus mecanismos de autenticación.

Un correo puede tener un texto completamente normal y, al mismo tiempo, mostrar señales claras de fraude en sus headers.

*[header-analyzer — próximamente]*

---

## Tecnologías

HTML · CSS · JavaScript vanilla · Python · scikit-learn · Flask · TF-IDF · SGD

---

## Sobre este proyecto

Soy estudiante de Ingeniería Informática y Ciberseguridad. A la fecha de este proyecto, mis conocimientos de programación están en una etapa inicial: fundamentos, lógica y exploración práctica.

Lo construí usando Claude, de Anthropic, como herramienta principal de desarrollo. La IA tuvo un rol importante en la implementación y en varias de las decisiones técnicas más complejas del sistema.

Mi parte fue definir qué quería explorar, evaluar las propuestas, probar el sistema, revisar sus resultados, descartar ideas que no tenían sentido, iterar sobre el funcionamiento y entender progresivamente cómo se conectaban sus distintas capas: reglas, modelo de machine learning y combinación híbrida.

Lo comparto como parte de mi proceso real de aprendizaje. Construir algo concreto, probarlo y encontrar sus límites me ayudó mucho más que limitarme solo a la teoría.

---

## Licencia

MIT
