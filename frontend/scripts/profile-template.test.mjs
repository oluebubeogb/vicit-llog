// Unit test for the v25 profile template renderer. Run: node scripts/profile-template.test.mjs (Node >= 22.6)
import assert from 'node:assert/strict';
import { renderTemplate, renderList, profileVars, placeholderSlug, DEFAULT_PROFILE_TEMPLATES, SYSTEM_PLACEHOLDERS, mergeTemplates, migrateLegacyTokens } from '../src/lib/profileTemplate.ts';

const amino = { fullName: 'Amino Bassy', email: 'amino@navy.mil.ng', phone: '', role: 'ADMIN', portfolio: 'Logistics', organisation: { name: 'Nigerian Navy', code: 'NN' }, customFieldsList: [{ key: 'rank', label: 'Rank', value: 'Captain' }, { key: 'service_no', label: 'Service No.', value: 'NN/1234' }] };
const noRank = { ...amino, customFieldsList: [] };
const v = profileVars(amino, { roleText: (r) => (r === 'ADMIN' ? 'Agency Admin' : r) });
const e = profileVars(noRank, { roleText: (r) => (r === 'ADMIN' ? 'Agency Admin' : r) });
let n = 0;
const t = (tpl, vars, want) => { assert.equal(renderTemplate(tpl, vars), want, `${JSON.stringify(tpl)}`); n++; };

t('[fullname] - [rank]', v, 'Amino Bassy - Captain');
t('[fullname] - [rank]', e, 'Amino Bassy');
t('[rank] [fullname]', v, 'Captain Amino Bassy');
t('[rank] [fullname]', e, 'Amino Bassy');
t('[rank] - [fullname]', e, 'Amino Bassy');
t('[agency] · [role]', v, 'Nigerian Navy · Agency Admin');
t('[agency] · [role] · [phone]', v, 'Nigerian Navy · Agency Admin');
t('[phone] | [email]', v, 'amino@navy.mil.ng');
t('[fullname], [rank], [portfolio]', e, 'Amino Bassy, Logistics');
t('[portfolio] / [rank] / [agencycode]', e, 'Logistics / NN');
t('[fullname] ([rank])', e, 'Amino Bassy');
t('[fullname] ([rank])', v, 'Amino Bassy (Captain)');
t('[firstname] [lastname]', v, 'Amino Bassy');
t('[serviceno]', v, 'NN/1234');
t('[Service No.]', v, 'NN/1234');
t('[unknown] - [fullname]', v, 'Amino Bassy');
t('[rank]', e, '');
t('[phone] · [rank]', e, '');
t('Hello [rank]', e, 'Hello');
t('', v, '');
assert.deepEqual(renderList(['[rank]', '[agencycode]', '[phone]'], e), ['NN']); n++;
assert.equal(placeholderSlug('Service No.'), 'serviceno'); n++;
// defaults reproduce the pre-v25 lines
assert.equal(renderTemplate(DEFAULT_PROFILE_TEMPLATES.dashboard.subtitle, v), 'Nigerian Navy · Agency Admin'); n++;
assert.equal(renderTemplate(DEFAULT_PROFILE_TEMPLATES.myProfile.subtitle, v), 'amino@navy.mil.ng'); n++;
// never a raw token or dangling separator
for (const tpl of ['[a] - [b] · [c]', ' - [rank] - ', '[rank]/[phone]', '| [phone] |']) { const out = renderTemplate(tpl, e); assert.ok(!/[\[\]]/.test(out) && !/^[-·|,/ ]|[-·|,/ ]$/.test(out), `${tpl} -> ${out}`); n++; }
// v29: [portfolio] is the system field; [department] belongs to a custom "Department" field
const dep = profileVars({ ...amino, customFieldsList: [{ key: 'department', label: 'Department', value: 'Signals' }] });
t('[portfolio] · [department]', dep, 'Logistics · Signals');
t('[department]', e, '');
const depObj = profileVars({ ...amino, customFieldsList: undefined, customFields: { department: 'Signals' } });
t('[Department] - [Portfolio]', depObj, 'Signals - Logistics');
assert.ok(SYSTEM_PLACEHOLDERS.some((p) => p.token === 'portfolio' && p.label === 'Portfolio') && !SYSTEM_PLACEHOLDERS.some((p) => p.token === 'department')); n++;
// saved pre-v29 templates: the system [department] becomes [portfolio], once
const old = mergeTemplates({ hostCard: { title: '[fullname]', subtitle: '[ Department ] · [agency]' }, myProfile: { badges: ['[department]', '[rank]'] } });
assert.equal(old.hostCard.subtitle, '[portfolio] · [agency]'); n++;
assert.deepEqual(old.myProfile.badges, ['[portfolio]', '[rank]']); n++;
assert.equal(old.tokens, 2); n++;
const fresh = mergeTemplates({ ...old, hostCard: { title: '[fullname]', subtitle: '[department] · [portfolio]' } });
assert.equal(fresh.hostCard.subtitle, '[department] · [portfolio]'); n++;
assert.equal(migrateLegacyTokens('[departments] [department]'), '[departments] [portfolio]'); n++;
console.log(`profile-template renderer: ${n} checks passed`);
