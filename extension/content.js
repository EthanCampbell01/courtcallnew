// Runs inside the ti.tournamentsoftware.com draw page when the popup asks for a scrape.
// Mirrors the EXTRACTOR in server/scraper.js so both import paths behave identically.
(() => {
  const rows = [];
  document.querySelectorAll('.match-group__item, .match, table.matches tr').forEach((el) => {
    const players = [...el.querySelectorAll('.match__row-title-value, .nav-link__value, td.player a')]
      .map((a) => a.textContent.trim())
      .filter(Boolean);
    if (players.length < 2) return;
    const seedText = el.textContent.match(/\[(\d+)\]/g) || [];
    rows.push({
      player1: players[0].replace(/\s*\[\d+\]\s*/g, ''),
      player2: players[1].replace(/\s*\[\d+\]\s*/g, ''),
      seed1: seedText[0] ? Number(seedText[0].replace(/\D/g, '')) : null,
      seed2: seedText[1] ? Number(seedText[1].replace(/\D/g, '')) : null,
      round:
        el.closest('[data-round-name]')?.dataset.roundName ||
        el.closest('.match-group')?.querySelector('h3,h2,.match-group__header')?.textContent.trim() ||
        'Round 1',
    });
  });
  const title =
    document.querySelector('h1, .page-title, .media__title')?.textContent.trim() || document.title;
  return { title, rows, url: location.href };
})();
