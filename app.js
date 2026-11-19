const askButton = document.getElementById("askButton");
const dojButton = document.getElementById("dojButton");
const input = document.getElementById("question");
const message = document.getElementById("message");
const answerCard = document.getElementById("answerCard");
const answer = document.getElementById("answer");
const sourceBadge = document.getElementById("sourceBadge");
const sourcesSection = document.getElementById("sourcesSection");
const sourcesList = document.getElementById("sourcesList");
const latestUpdates = document.getElementById("latestUpdates");
const updatesStatus = document.getElementById("updatesStatus");
const refreshUpdates = document.getElementById("refreshUpdates");

askButton.addEventListener("click", runGeneralInvestigation);
dojButton.addEventListener("click", runDOJInvestigation);
refreshUpdates.addEventListener("click", loadLatestUpdates);
loadLatestUpdates();

async function runGeneralInvestigation() {
  const question = input.value.trim();
  if (!validateQuestion(question)) return;
  startLoading("Preparing a general evidence assessment...");

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await readJsonResponse(response, "The general AI endpoint returned an invalid response.");
    if (!response.ok) throw new Error(data.error || "The request failed.");
    showAnswer({
      text: data.answer,
      badge: data.provider ? `General assessment · ${data.provider}` : "General AI assessment",
      sources: []
    });
  } catch (error) {
    showError(error.message || "Something went wrong.");
  } finally {
    finishLoading();
  }
}

async function runDOJInvestigation() {
  const question = input.value.trim();
  if (!validateQuestion(question)) return;

  if (question.length > 100) {
    message.textContent = "DOJ searches are currently limited to 100 characters. Please shorten the question.";
    return;
  }

  startLoading("Searching live Department of Justice records...");

  try {
    const response = await fetch(`/api/ask-doj?q=${encodeURIComponent(question)}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    const data = await readJsonResponse(response, "The DOJ assessment endpoint returned an invalid response.");
    if (!response.ok) throw new Error(data.error || "The DOJ search failed.");
    showAnswer({
      text: data.answer,
      badge: `Official DOJ search · ${data.provider || "AI assessment"}`,
      sources: Array.isArray(data.sources) ? data.sources : []
    });
  } catch (error) {
    showError(error.message || "The DOJ search failed.");
  } finally {
    finishLoading();
  }
}

async function loadLatestUpdates() {
  refreshUpdates.disabled = true;
  updatesStatus.textContent = "Loading latest DOJ updates...";
  latestUpdates.replaceChildren();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`/api/doj-latest?refresh=${Date.now()}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    const data = await readJsonResponse(response, "The Latest DOJ Updates service returned an invalid response.");
    if (!response.ok) throw new Error(data.error || "Updates could not be loaded.");

    const updates = Array.isArray(data.updates) ? data.updates : [];
    if (updates.length === 0) {
      updatesStatus.textContent = "No DOJ updates are available right now.";
      return;
    }

    for (const update of updates) {
      if (isSafeDOJUrl(update.url)) latestUpdates.append(createUpdateCard(update));
    }

    const visibleCount = latestUpdates.children.length;
    updatesStatus.textContent = visibleCount
      ? `Showing ${visibleCount} official update${visibleCount === 1 ? "" : "s"}.`
      : "No valid official DOJ updates were returned.";
  } catch (error) {
    updatesStatus.textContent = error.name === "AbortError"
      ? "The DOJ feed took longer than 15 seconds. Please click Refresh updates."
      : error.message || "Latest DOJ updates could not be loaded.";
  } finally {
    clearTimeout(timeout);
    refreshUpdates.disabled = false;
  }
}

async function readJsonResponse(response, invalidResponseMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(invalidResponseMessage);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("The service returned unreadable data.");
  }
}

function createUpdateCard(update) {
  const article = document.createElement("article");
  article.className = "update-card";

  const meta = document.createElement("div");
  meta.className = "update-meta";

  const source = document.createElement("span");
  source.textContent = "U.S. DOJ";

  const date = document.createElement("time");
  date.textContent = formatDisplayDate(update.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(update.date || "")) date.dateTime = update.date;
  meta.append(source, date);

  const title = document.createElement("h3");
  const link = document.createElement("a");
  link.href = update.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = update.title || "View official DOJ update";
  title.append(link);

  const excerpt = document.createElement("p");
  excerpt.textContent = update.excerpt || "Open the official DOJ record for details.";
  article.append(meta, title, excerpt);
  return article;
}

function formatDisplayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "Date unavailable";
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function validateQuestion(question) {
  if (question.length < 10) {
    message.textContent = "Please enter a specific question of at least 10 characters.";
    return false;
  }
  if (question.length > 1000) {
    message.textContent = "Please keep the question under 1,000 characters.";
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

function showAnswer({ text, badge, sources }) {
  answer.textContent = text;
  sourceBadge.textContent = badge;
  message.textContent = "";
  renderSources(sources);
  answerCard.classList.remove("hidden");
  answerCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSources(sources) {
  sourcesList.replaceChildren();
  if (!sources.length) {
    sourcesSection.classList.add("hidden");
    return;
  }

  for (const source of sources) {
    if (!isSafeDOJUrl(source.url)) continue;
    const card = document.createElement("article");
    card.className = "source-card";
    const label = document.createElement("span");
    label.className = "source-label";
    label.textContent = source.label || "DOJ source";
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title || "View DOJ record";
    const date = document.createElement("p");
    date.textContent = source.date || "Date unavailable";
    card.append(label, link, date);
    sourcesList.append(card);
  }

  sourcesSection.classList.toggle("hidden", sourcesList.children.length === 0);
}

function isSafeDOJUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "justice.gov" ||
      url.hostname === "www.justice.gov" ||
      url.hostname.endsWith(".justice.gov")
    );
  } catch {
    return false;
  }
}
