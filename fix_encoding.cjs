const fs = require('fs');
let t = fs.readFileSync('src/components/pages/ApisPage.tsx', 'utf8');

const map = {
  'Ã°Å¸â€ â€˜': '🔑',
  'Ã¢Å“â€œ': '✔️',
  'Ã°Å¸â€œÅ ': '📊',
  'Ã°Å¸â€ Â ': '🔍',
  'Ã¢â‚¬Â¢': '•',
  'Ã¢â€žÂ¢': '',
  'Ã‚Â·': '·',
  'Ã¢â‚¬â€œ': '–',
  'Ã¢â€ â€™': '→',
  'Ã¢Å“Å½': '✏️',
  'Ã°Å¸â€”â€˜': '🗑️',
  'Ã¢Å¡Â ': '⚠️',
  'Ã¢Å“â€”': '✖',
  'Ã¢â‚¬â€': '—',
  'Ã‚Â©': '©'
};

for (const [bad, good] of Object.entries(map)) {
  t = t.split(bad).join(good);
}

// Additional cleanups for other broken characters seen in log
// A,AA,AA,AA,AA,AA,AA,AA,A -> •••••••••
// we can just use regex for 're_A.*' -> 're_••••••••'
t = t.replace(/re_Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢/g, 're_•••');
t = t.replace(/A,AA,A/g, '••');

fs.writeFileSync('src/components/pages/ApisPage.tsx', t, 'utf8');
console.log('Done!');
