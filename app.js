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

    const data = await readJsonResponse(
      response,
      "The general AI endpoint returned an invalid response."
    );

    if (!response.ok) {
      throw new Error(
        data.error || "The request failed."
      );
    }

    showAnswer({
      text: data.answer,
      badge: data.provider
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

  if (!validateQuestion(
