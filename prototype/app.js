const toast = document.querySelector("#toast");
const runStatus = document.querySelector("#runStatus");
const stepCount = document.querySelector("#stepCount");
const runButton = document.querySelector("#runWorkflow");
const approveButton = document.querySelector("#approveButton");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
    showToast(`${item.textContent.trim()} view is ready for the next milestone.`);
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    showToast(`${tab.textContent.trim()} selected`);
  });
});

document.querySelector("#openPlan").addEventListener("click", () => {
  showToast("Plan view will open the editable project workflow.");
});

document.querySelector("#newRun").addEventListener("click", () => {
  document.querySelector("#taskInput").focus();
  showToast("Describe the next project task, then run it.");
});

runButton.addEventListener("click", () => {
  runButton.disabled = true;
  runButton.textContent = "Starting…";
  runStatus.textContent = "Planning";
  runStatus.className = "pill running";
  showToast("Manager Agent is creating a new plan.");

  window.setTimeout(() => {
    runStatus.textContent = "Running";
    stepCount.textContent = "1";
    runButton.disabled = false;
    runButton.innerHTML = "Run workflow <span>↗</span>";
    showToast("Run started. The timeline will stream updates here.");
  }, 1200);
});

approveButton.addEventListener("click", () => {
  approveButton.textContent = "Approved";
  approveButton.disabled = true;
  approveButton.classList.remove("primary");
  approveButton.classList.add("secondary");
  runStatus.textContent = "Deploying";
  showToast("Staging deployment approved. Release Engineer is starting.");
});
