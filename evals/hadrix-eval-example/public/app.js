(() => {
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    form.addEventListener("submit", () => {
      form.classList.add("is-submitting");
    });
  });
})();
