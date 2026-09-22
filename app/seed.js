export async function seedWelcome(store) {
  if (
    (await store.list("courses")).length ||
    (await store.get("settings", "initialized"))
  )
    return;
  await store.put("settings", { id: "initialized", value: true });
  await store.put("courses", {
    id: "welcome",
    title: "Tu sistema de aprendizaje",
    description:
      "Una guía breve para preparar tu biblioteca y estudiar con intención. Contenido de bienvenida, no material oficial CFA.",
    color: "#c4dca5",
    order: 0,
  });
  await store.put("modules", {
    id: "welcome-start",
    courseId: "welcome",
    title: "Empieza por aquí",
    description: "Prepara, aprende y repasa.",
    order: 0,
  });
  const items = [
    [
      "Organiza tu punto de partida",
      "Tu biblioteca puede tener varios cursos. Cada curso contiene módulos y cada módulo contiene lecciones.\n\nAbre Gestionar para crear tu propio curso, añadir módulos y escribir o importar lecciones. El curso original está en el archivo migration/curso-original.json del ZIP: impórtalo desde Gestionar → Importar respaldo / curso.\n\nUsa el mismo dominio de tu web anterior para recuperar su avance desde Ajustes → Recuperar avance anterior.",
    ],
    [
      "Estudia para poder explicarlo",
      "Antes de leer, escribe una pregunta que quieras responder. Durante la lectura, identifica una idea y un ejemplo. Al terminar, cierra el texto e intenta explicar la idea con tus palabras.\n\nMarca como estudiada una lección solo cuando hayas trabajado su contenido. Esa marca mide cobertura; tu rendimiento en preguntas y tus repasos son medidas diferentes.\n\nEn el lector puedes crear notas y tarjetas a partir de un fragmento seleccionado. Comprueba siempre la respuesta de una tarjeta contra su fuente.",
    ],
    [
      "Convierte el repaso en una rutina",
      "En Práctica responde antes de consultar la explicación. Si fallas, vuelve a la fuente y razona por qué la alternativa correcta sí responde la pregunta.\n\nEn Repasar, intenta recordar la respuesta antes de revelarla. Después elige Otra vez, Difícil, Bien o Fácil. El siguiente repaso se programa según tu evaluación.\n\nConfigura tu meta diaria y tu fecha objetivo en Ajustes. Usa sesiones de enfoque para registrar tiempo real de estudio.",
    ],
  ];
  for (let i = 0; i < items.length; i++)
    await store.put("lessons", {
      id: `welcome-${i + 1}`,
      courseId: "welcome",
      moduleId: "welcome-start",
      title: items[i][0],
      content: items[i][1],
      order: i,
      sourceLabel: "Guía de uso · Study Atlas",
    });
  await store.put("cards", {
    id: "welcome-card",
    courseId: "welcome",
    moduleId: "welcome-start",
    lessonId: "welcome-2",
    front: "¿Qué diferencia hay entre cobertura y dominio?",
    back: "Cobertura: material que has estudiado. Dominio: capacidad de recuperar y aplicar lo aprendido; requiere práctica y repaso.",
    sourceLabel: "Guía de uso",
    interval: 0,
    repetitions: 0,
    ease: 2.5,
  });
  await store.put("questions", {
    id: "welcome-question",
    courseId: "welcome",
    moduleId: "welcome-start",
    lessonId: "welcome-2",
    prompt:
      "Después de leer una lección, ¿qué acción te permite comprobar mejor si puedes recordar su idea central?",
    options: [
      "Volver a mirar el título",
      "Cerrar el texto y explicarla con tus propias palabras",
      "Marcar todas sus páginas como estudiadas",
    ],
    correctIndex: 1,
    explanation:
      "Explicar sin consultar el texto exige recuperar la idea. Marcar páginas registra cobertura, pero por sí solo no comprueba comprensión.",
    sourceLabel: "Guía de uso",
  });
}
