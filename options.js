const inputFields = ["anthropicKey", "anthropicModel", "openaiKey", "openaiModel"];

function setupClaySelect(rootId) {
  const root = document.getElementById(rootId);
  const trigger = root.querySelector(".clay-select-trigger");
  const labelEl = trigger.querySelector(".label");
  const subEl = trigger.querySelector(".clay-select-option-sub");
  const options = [...root.querySelectorAll(".clay-select-option")];

  const open = () => {
    root.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    root.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  };

  const setValue = (value, fromUser = false) => {
    const opt = options.find((o) => o.dataset.value === value);
    if (!opt) return;
    root.dataset.value = value;
    labelEl.textContent = opt.dataset.label;
    if (subEl) subEl.textContent = opt.dataset.sub || "";
    options.forEach((o) => o.classList.toggle("selected", o === opt));
    if (fromUser) root.dispatchEvent(new CustomEvent("change", { detail: value }));
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    root.classList.contains("open") ? close() : open();
  });
  options.forEach((opt) => {
    const select = () => {
      setValue(opt.dataset.value, true);
      close();
      trigger.focus();
    };
    opt.addEventListener("click", select);
    opt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("open")) {
      close();
      trigger.focus();
    }
  });

  return {
    get value() { return root.dataset.value; },
    set value(v) { setValue(v, false); },
  };
}

const providerSelect = setupClaySelect("preferredProvider");

(async () => {
  const cfg = await chrome.storage.local.get([...inputFields, "preferredProvider"]);
  inputFields.forEach((f) => {
    if (cfg[f]) document.getElementById(f).value = cfg[f];
  });
  if (cfg.preferredProvider) providerSelect.value = cfg.preferredProvider;
})();

document.getElementById("save").addEventListener("click", async () => {
  const data = { preferredProvider: providerSelect.value };
  inputFields.forEach((f) => {
    data[f] = document.getElementById(f).value.trim();
  });
  await chrome.storage.local.set(data);
  const note = document.getElementById("saved");
  note.classList.add("visible");
  setTimeout(() => note.classList.remove("visible"), 1500);
});
