// main.js
// 負責 UI 初始、區域縮放、Analyze / Reset 按鈕綁定

// ---------- 區域縮放 (Collapsible Sections) ----------

document.addEventListener("click", (e) => {
  const header = e.target.closest(".collapsible-header");
  if (!header) return;

  const targetId = header.dataset.target;
  if (!targetId) return;

  const body = document.getElementById(targetId);
  if (!body) return;

  const btn = header.querySelector(".collapse-toggle");

  const isCollapsed = body.classList.toggle("collapsed");
  if (isCollapsed) {
    body.style.maxHeight = "0px";
    if (btn) btn.textContent = "＋";
  } else {
    body.style.maxHeight = body.scrollHeight + "px";
    if (btn) btn.textContent = "－";
  }
});

// 當某個 section 初次顯示 / 重新展開時，用呢個展開
function expandBody(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.remove("collapsed");
  body.style.maxHeight = body.scrollHeight + "px";
}

// 暴露俾其他檔用
window.expandBody = expandBody;
