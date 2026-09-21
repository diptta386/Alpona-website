(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const selector = [
    ".editorialIntro",
    ".visualCard",
    ".sectionHead",
    ".card",
    ".storyImageWrap",
    ".storyCopy",
    ".promiseGrid article",
    ".steps > div",
    ".mehendiIntro",
    ".mehendiBookingCard",
    ".damagePolicy",
    ".damageReportCard"
  ].join(",");

  if (reduceMotion || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8%" }
  );

  function register(root) {
    const elements = root.matches?.(selector)
      ? [root]
      : [...root.querySelectorAll?.(selector) || []];

    elements.forEach((element, index) => {
      if (element.classList.contains("reveal-ready")) return;
      element.classList.add("reveal-ready");
      element.dataset.revealDelay = String((index % 4) + 1);
      observer.observe(element);
    });
  }

  register(document);

  const productGrid = document.getElementById("products");
  if (productGrid) {
    new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) register(node);
        });
      });
    }).observe(productGrid, { childList: true });
  }
})();
