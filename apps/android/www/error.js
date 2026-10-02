// "Coba lagi" returns to the page that failed to load, which makes the WebView request it again.
document.getElementById("retry").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.reload();
});
