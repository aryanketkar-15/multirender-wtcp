/**
 * The twenty adversarial mutations of milestone 6.2 (redone). Each is a deterministic function that
 * runs INSIDE the page, on the real DOM, between page load and measurement: the position an attacker
 * who controls the displayed page would be in. A function returns true when it changed the page and
 * false when the page has nothing for it to change (reported as "not applicable", never as a miss).
 *
 * Taxonomy references are at paper level: the pattern class is documented in the cited work. The
 * individual entries are not independently verified against the papers' tables.
 *   Nouwens2020: Nouwens, Liccardi, Veale, Karger, Kagal. "Dark Patterns after the GDPR". CHI 2020.
 *   Matte2020:   Matte, Bielova, Santos. "Do Cookie Banners Respect my Choice?". IEEE S&P 2020.
 *   Brignull:    the dark-pattern catalogue (confirmshaming), cited for M-06 only.
 * M-18 is a control: a cosmetic change that must NOT change the digest.
 *
 * "target" names the digest feature expected to catch it (an expectation, not a result).
 */

const defs = [
  {
    id: 'M-01', name: 'accept_visual_prominence', taxonomy: 'Nouwens2020', category: 'visual_interference', target: 'style:size/prominence',
    description: 'Accept button font size doubled and padded, so it dominates the reject option.',
    fn: () => { const R = document.querySelector('#consent-region'); const b = R.querySelector('#btn-agree'); if (!b) return false; b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * 2) + 'px'; b.style.padding = '18px 32px'; return true; },
  },
  {
    id: 'M-02', name: 'reject_removed_from_first_layer', taxonomy: 'Nouwens2020', category: 'obstruction', target: 'structure (role)',
    description: 'The reject control is removed from the banner.',
    fn: () => { const b = document.querySelector('#consent-region #btn-reject'); if (!b) return false; b.remove(); return true; },
  },
  {
    id: 'M-03', name: 'preticked_purposes', taxonomy: 'Nouwens2020', category: 'pre_selection', target: 'state',
    description: 'Optional purpose checkboxes and switches are pre-selected.',
    fn: () => { const R = document.querySelector('#consent-region'); let any = false; R.querySelectorAll('input[type=checkbox]').forEach((c) => { if (!c.checked && !c.disabled) { c.checked = true; any = true; } }); R.querySelectorAll('[role=switch]').forEach((s) => { if (s.getAttribute('aria-checked') === 'false' && !s.disabled) { s.setAttribute('aria-checked', 'true'); any = true; } }); return any; },
  },
  {
    id: 'M-04', name: 'purpose_text_truncated', taxonomy: 'Matte2020', category: 'misleading_information', target: 'text',
    description: 'Purpose descriptions are cut to 18 characters with an ellipsis.',
    fn: () => { const d = document.querySelectorAll('#consent-region .desc'); if (!d.length) return false; d.forEach((e) => { e.textContent = e.textContent.slice(0, 18) + '...'; }); return true; },
  },
  {
    id: 'M-05', name: 'zero_width_text_injection', taxonomy: 'Matte2020', category: 'text_obfuscation', target: 'normalisation (expected to be absorbed)',
    description: 'Zero-width joiners and BOMs are inserted into the disclosure text. Invisible to the user, so the semantic digest is designed NOT to change; the bundle hash is what catches this.',
    fn: () => { const p = document.querySelector('#consent-region .disclosure'); if (!p) return false; p.textContent = p.textContent.split(' ').map((w) => w.slice(0, 1) + String.fromCharCode(0x200d) + w.slice(1) + String.fromCharCode(0xfeff)).join(' '); return true; },
  },
  {
    id: 'M-06', name: 'confirmshaming_label', taxonomy: 'Brignull', category: 'confirmshaming', target: 'text',
    description: 'The reject control is relabelled to shame the user.',
    fn: () => { const b = document.querySelector('#consent-region #btn-reject'); if (!b) return false; b.textContent = "No thanks, I don't care about my privacy"; return true; },
  },
  {
    id: 'M-07', name: 'purposes_removed', taxonomy: 'Matte2020', category: 'undisclosed_purpose', target: 'structure',
    description: 'The last two purposes are removed from the displayed list.',
    fn: () => { const li = document.querySelectorAll('#consent-region .purpose'); if (li.length < 3) return false; li[li.length - 1].remove(); li[li.length - 2].remove(); return true; },
  },
  {
    id: 'M-08', name: 'vendor_list_suppressed', taxonomy: 'Matte2020', category: 'undisclosed_vendor', target: 'structure',
    description: 'The partner count and the link to the partner list are removed.',
    fn: () => { const a = document.querySelector('#consent-region a.vendors'); if (!a) return false; a.parentElement.remove(); return true; },
  },
  {
    id: 'M-09', name: 'wall_without_reject', taxonomy: 'Nouwens2020', category: 'obstruction', target: 'structure',
    description: 'Both the reject and the settings controls are removed: only Accept remains.',
    fn: () => { const R = document.querySelector('#consent-region'); const x = [R.querySelector('#btn-reject'), R.querySelector('#btn-manage')].filter(Boolean); if (!x.length) return false; x.forEach((e) => e.remove()); return true; },
  },
  {
    id: 'M-10', name: 'implied_consent_text', taxonomy: 'Matte2020', category: 'implied_consent', target: 'text + structure',
    description: 'The text is replaced by "By scrolling you accept all cookies" and both buttons are removed.',
    fn: () => { const R = document.querySelector('#consent-region'); const p = R.querySelector('.disclosure'); if (!p) return false; p.textContent = 'By scrolling you accept all cookies.'; ['#btn-agree', '#btn-reject'].forEach((s) => { const e = R.querySelector(s); if (e) e.remove(); }); return true; },
  },
  {
    id: 'M-11', name: 'switch_semantics_inverted', taxonomy: 'Nouwens2020', category: 'ui_deception', target: 'state',
    description: 'aria-checked on every switch is inverted while the switch keeps looking the same.',
    fn: () => { const sw = document.querySelectorAll('#consent-region [role=switch]'); if (!sw.length) return false; sw.forEach((s) => { const bg = getComputedStyle(s).backgroundColor; s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); s.style.background = bg; }); return true; },
  },
  {
    id: 'M-12', name: 'purpose_labels_swapped', taxonomy: 'Matte2020', category: 'misleading_information', target: 'text (order)',
    description: 'The labels of the first two optional purposes are swapped; descriptions stay in place.',
    fn: () => { const li = document.querySelectorAll('#consent-region .purpose'); if (li.length < 3) return false; const el = (l) => l.querySelector('.pname') || l.querySelector('label'); const a = el(li[1]); const b = el(li[2]); const ta = a.lastChild; const tb = b.lastChild; const t = ta.textContent; ta.textContent = tb.textContent; tb.textContent = t; const sa = li[1].querySelector('[role=switch]'); const sb = li[2].querySelector('[role=switch]'); if (sa && sb) { const l = sa.getAttribute('aria-label'); sa.setAttribute('aria-label', sb.getAttribute('aria-label')); sb.setAttribute('aria-label', l); } return true; },
  },
  {
    id: 'M-13', name: 'transparent_overlay_on_reject', taxonomy: 'Nouwens2020', category: 'visual_interference', target: 'occlusion',
    description: 'A transparent element is laid over the reject control and receives its clicks.',
    fn: () => { const b = document.querySelector('#consent-region #btn-reject'); if (!b) return false; const r = b.getBoundingClientRect(); const o = document.createElement('div'); o.style.cssText = 'position:fixed;background:transparent;z-index:99999;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px'; document.body.appendChild(o); return true; },
  },
  {
    id: 'M-14', name: 'reject_contrast_degraded', taxonomy: 'Nouwens2020', category: 'visual_interference', target: 'style:contrast',
    description: 'The reject control is set to pale grey text on white.',
    fn: () => { const b = document.querySelector('#consent-region #btn-reject'); if (!b) return false; b.style.color = '#cccccc'; b.style.background = '#ffffff'; return true; },
  },
  {
    id: 'M-15', name: 'granular_choice_removed', taxonomy: 'Nouwens2020', category: 'obstruction', target: 'structure (role)',
    description: 'All purpose toggles are removed, leaving only the text: no granular choice.',
    fn: () => { const w = document.querySelectorAll('#consent-region .purpose input, #consent-region .purpose [role=switch]'); if (!w.length) return false; w.forEach((e) => e.remove()); return true; },
  },
  {
    id: 'M-16', name: 'duration_omitted', taxonomy: 'Matte2020', category: 'information_omission', target: 'text',
    description: 'The sentence stating how long the choice is stored is removed.',
    fn: () => { const d = document.querySelector('#consent-region .duration'); if (!d) return false; d.remove(); return true; },
  },
  {
    id: 'M-17', name: 'withdraw_link_removed', taxonomy: 'Nouwens2020', category: 'obstruction', target: 'context digest (outside the critical region)',
    description: 'The footer link for changing the choice later is removed. It is outside the critical region, so only the context digest can see it.',
    fn: () => { const a = document.querySelector('footer a.withdraw'); if (!a) return false; a.remove(); return true; },
  },
  {
    id: 'M-18', name: 'cosmetic_restyle', taxonomy: 'CONTROL', category: 'control_cosmetic', target: 'none (must NOT be detected)',
    description: 'The accept button background is darkened by 10%. Meaning, text, size, order and contrast bucket are unchanged.',
    fn: () => { const b = document.querySelector('#consent-region #btn-agree'); if (!b) return false; const m = getComputedStyle(b).backgroundColor.match(/[0-9.]+/g).map(Number); b.style.background = 'rgb(' + Math.round(m[0] * 0.9) + ',' + Math.round(m[1] * 0.9) + ',' + Math.round(m[2] * 0.9) + ')'; return true; },
  },
  {
    id: 'M-19', name: 'button_role_stripped', taxonomy: 'Matte2020', category: 'accessibility_bypass', target: 'structure (role)',
    description: 'role=button is removed from elements styled as buttons, so they stop being exposed as controls.',
    fn: () => { const e = document.querySelectorAll('#consent-region [role=button]'); if (!e.length) return false; e.forEach((x) => x.removeAttribute('role')); return true; },
  },
  {
    id: 'M-20', name: 'purposes_reordered', taxonomy: 'Matte2020', category: 'undisclosed_purpose', target: 'text (order)',
    description: 'The third purpose is moved to the top of the list.',
    fn: () => { const ul = document.querySelector('#consent-region .purposes'); const li = ul ? ul.querySelectorAll('.purpose') : []; if (li.length < 3) return false; ul.insertBefore(li[2], li[0]); return true; },
  },
];

const mutations = defs.map((d) => ({ id: d.id, name: d.name, taxonomy: d.taxonomy, category: d.category, target: d.target, description: d.description, source: '(' + d.fn.toString() + ')' }));
module.exports = { mutations };
