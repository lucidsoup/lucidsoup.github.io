  // the boxes as liquid splatters (assets/splat.js): the screen's frame, the tracks, the install box
  (() => {
    const { splatBox } = window.SoupSplat;
    splatBox(document.querySelector(".screen .frame"), 7, { fill: "#07040c", stroke: "var(--rule)", amp: 10, drip: 28, splash: 6 });
    document.querySelectorAll(".tracks li").forEach((li, i) => splatBox(li, 31 + i, { fill: "var(--panel)", amp: 7, drip: 18, splash: 3 }));
    splatBox(document.querySelector(".install"), 61, { fill: "var(--panel)", stroke: "var(--rule)", amp: 12, drip: 30, splash: 6 });
  })();
