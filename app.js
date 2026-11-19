const askButton =
  document.getElementById("askButton");

const dojButton =
  document.getElementById("dojButton");

const input =
  document.getElementById("question");

const message =
  document.getElementById("message");

const answerCard =
  document.getElementById("answerCard");

const answer =
  document.getElementById("answer");

const sourceBadge =
  document.getElementById("sourceBadge");

const sourcesSection =
  document.getElementById("sourcesSection");

const sourcesList =
  document.getElementById("sourcesList");

askButton.addEventListener("click", () => {
  runGeneralInvestigation();
});

dojButton.addEventListener("click", () => {
  runDOJInvestigation();
});

async function runGeneralInvestigation() {
  const question = input.value.trim();

  if (!validateQuestion(question)) {
    return;
  }

  startLoading("Preparing a general evidence assessment...");

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "The request failed."
      );
    }

    showAnswer({
      text: data.answer,
      badge:
        data.provider
          ? `General assessment · ${data.provider}`
          : "General AI assessment",
      sources: []
    });
  } catch (error) {
    showError(
      error.message || "Something went wrong."
    );
  } finally {
    finishLoading();
  }
}

async function runDOJInvestigation() {
  const question = input.value.trim();

  if (!validateQuestion(question)) {
    return;
  }

  startLoading(
    "Searching live Department of Justice records..."
  );

  try {
    const endpoint =
      `/api/ask-doj?q=${encodeURIComponent(question)}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "The DOJ search failed."
      );
    }

    showAnswer({
      text: data.answer,
      badge:
        `Official DOJ search · ${data.provider || "AI assessment"}`,
      sources: Array.isArray(data.sources)
        ? data.sources
        : []
    });
  } catch (error) {
    showError(
      error.message || "The DOJ search failed."
    );
  } finally {
    finishLoading();
  }
}

function validateQuestion(question) {
  if (question.length < 10) {
    message.textContent =
      "Please enter a specific question of at least 10 characters.";

    return false;
  }

  if (question.length > 1000) {
    message.textContent =
      "Please keep the question under 1,000 characters.";

    return false;
  }

  return true;
}

function startLoading(text) {
  askButton.disabled = true;
  dojButton.disabled = true;
  message.textContent = text;

  answerCard.classList.add("hidden");
  sourcesSection.classList.add("hidden");
  sourcesList.replaceChildren();
}

function finishLoading() {
  askButton.disabled = false;
  dojButton.disabled = false;
}

function showError(text) {
  message.textContent = text;
}

function showAnswer({
  text,
  badge,
  sources
}) {
  answer.textContent = text;
  sourceBadge.textContent = badge;
  message.textContent = "";

  renderSources(sources);

  answerCard.classList.remove("hidden");
  answerCard.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderSources(sources) {
  sourcesList.replaceChildren();

  if (!sources.length) {
    sourcesSection.classList.add("hidden");
    return;
  }

  for (const source of sources) {
    if (!isSafeDOJUrl(source.url)) {
      continue;
    }

    const card =
      document.createElement("article");

    card.className = "source-card";

    const label =
      document.createElement("span");

    label.className = "source-label";
    label.textContent =
      source.label || "DOJ source";

    const link =
      document.createElement("a");

    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent =
      source.title || "View DOJ record";

    const date =
      document.createElement("p");

    date.textContent =
      source.date || "Date unavailable";

    card.append(label, link, date);
    sourcesList.append(card);
  }

  if (sourcesList.children.length > 0) {
    sourcesSection.classList.remove("hidden");
  } else {
    sourcesSection.classList.add("hidden");
  }
}

function isSafeDOJUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (
        url.hostname === "justice.gov" ||
        url.hostname === "www.justice.gov" ||
        url.hostname.endsWith(".justice.gov")
      )
    );
  } catch {
    return false;
  }
}
