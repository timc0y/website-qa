/* ── FORM AUDIT ─────────────────────────────────────────────────────────────────
 *
 * QA never submits a client's form. That rule is right — a test submission lands in a real
 * inbox, a real CRM, and sometimes a real sales pipeline. But taken as "so forms can't be
 * QA'd" it leaves the single most expensive component on a lead-generation site completely
 * unchecked. On an insurance site the quote form *is* the product.
 *
 * Almost everything that breaks a form is visible without sending one:
 *   - the success and error messages Webflow ships are still the default text, or were deleted
 *   - no redirect and no success state, so a submit appears to do nothing
 *   - fields with no name attribute — they submit, and the value silently never arrives
 *   - an email field with type="text", so anything is accepted
 *   - required fields that aren't marked required, or marked required with no visible cue
 *   - validation that never fires until submit, so the user gets one wall of errors
 *   - a submit button disabled with no explanation, or wired to nothing
 *
 * The one interactive part is blur validation: fill a deliberately invalid value, blur the
 * field, and see whether anything says so. That types into inputs but NEVER submits — no
 * click on submit, no Enter key, and the page is discarded afterwards.
 */

const INVALID_FOR = t => ({
  email: 'not-an-email', tel: 'abc', url: 'nope', number: 'abc', date: '99'
}[t] || '');

export async function formAudit(page, { testBlurValidation = true, maxForms = 4 } = {}) {
  const inventory = await page.evaluate(() => {
    const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
    const desc = el => el.tagName.toLowerCase() +
      (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
    const vis = el => { const c = getComputedStyle(el), r = el.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

    // Webflow's stock strings — if these survive, nobody configured the form
    const DEFAULT_DONE = /thank you!?\s*your submission has been received/i;
    const DEFAULT_FAIL = /oops!?\s*something went wrong while submitting the form/i;

    return Array.from(document.querySelectorAll('form')).map((form, fi) => {
      const wrap = form.closest('.w-form') || form.parentElement;
      const done = wrap && wrap.querySelector('.w-form-done, [class*="form-done"], [class*="success"]');
      const fail = wrap && wrap.querySelector('.w-form-fail, [class*="form-fail"], [class*="error-message"]');
      /* Buttons are not data fields. Including input[type=submit] made the audit demand a
       * name attribute, a <label> and a 16px font-size from the send button — three
       * false findings on a correctly built form. */
      const fields = Array.from(form.querySelectorAll('input:not([type=hidden]),select,textarea'))
        .filter(f => !/^(submit|button|reset|image)$/i.test(f.type || ''))
        .filter(vis).map((f, i) => {
          const id = f.id;
          const label = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || f.closest('label');
          const labelText = label ? label.textContent.trim().slice(0, 40) : null;
          const looksEmail = /mail/i.test((f.name || '') + id + (f.placeholder || '') + (labelText || ''));
          const looksPhone = /phone|tel|mobile/i.test((f.name || '') + id + (f.placeholder || '') + (labelText || ''));
          const starred = !!(labelText && /\*/.test(labelText));
          return { i, el: desc(f), tag: f.tagName.toLowerCase(), type: f.type || null,
            name: f.name || null, hasName: !!f.name,
            label: labelText, labelledBy: !!(label || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')),
            placeholder: f.placeholder || null,
            required: f.required || f.getAttribute('aria-required') === 'true',
            starredLabel: starred,
            autocomplete: f.getAttribute('autocomplete'),
            fontSize: parseFloat(getComputedStyle(f).fontSize),
            wrongTypeForEmail: looksEmail && f.type !== 'email',
            wrongTypeForPhone: looksPhone && f.type !== 'tel',
            selector: f.id ? '#' + f.id : (f.name ? `${f.tagName.toLowerCase()}[name="${f.name}"]` : null) };
        });
      const submit = form.querySelector('[type=submit],button:not([type=button]),.w-button,[class*="submit"]');
      return {
        formIndex: fi, el: desc(form), name: form.getAttribute('name') || form.id || null,
        visible: vis(form),
        action: form.getAttribute('action') || null,
        method: (form.getAttribute('method') || 'get').toLowerCase(),
        isWebflowForm: !!(wrap && /w-form/.test(cls(wrap))),
        redirect: form.getAttribute('data-redirect') || form.getAttribute('data-wf-page-redirect') || null,
        novalidate: form.hasAttribute('novalidate'),
        successElement: done ? { el: desc(done), text: done.textContent.trim().slice(0, 70),
          isWebflowDefault: DEFAULT_DONE.test(done.textContent || '') } : null,
        errorElement: fail ? { el: desc(fail), text: fail.textContent.trim().slice(0, 70),
          isWebflowDefault: DEFAULT_FAIL.test(fail.textContent || '') } : null,
        submitButton: submit ? { el: desc(submit),
          text: (submit.value || submit.textContent || '').trim().slice(0, 24),
          disabled: !!submit.disabled,
          waitText: submit.getAttribute('data-wait') || null } : null,
        hasCaptcha: !!form.querySelector('.w-recaptcha,[class*="recaptcha"],[class*="turnstile"],[class*="hcaptcha"]'),
        fieldCount: fields.length, fields
      };
    });
  });

  // ── blur validation: invalid value in, blur, does anything say so? Never submits. ──
  const visibleInventory = inventory.filter(form => form.visible);

  if (testBlurValidation) {
    for (const form of visibleInventory.slice(0, maxForms)) {
      for (const f of form.fields) {
        if (!f.selector || f.tag === 'select') continue;
        const bad = INVALID_FOR(f.type);
        if (!bad && !f.required) continue;             // nothing meaningful to test
        try {
          const before = await snapshotMessages(page, form.formIndex);
          const loc = page.locator(`form >> nth=${form.formIndex}`).locator(f.selector).first();
          if (!(await loc.count())) continue;
          await loc.fill(bad);                          // typing only
          await loc.blur().catch(() => {});
          await page.waitForTimeout(400);
          const after = await snapshotMessages(page, form.formIndex);
          f.blurValidation = {
            testedWith: bad === '' ? '(left empty)' : `"${bad}"`,
            nativeInvalid: await loc.evaluate(el => !el.checkValidity()).catch(() => null),
            visibleMessageAppeared: after.count > before.count || after.text !== before.text,
            ariaInvalidSet: await loc.evaluate(el => el.getAttribute('aria-invalid') === 'true').catch(() => null),
            newMessage: after.text && after.text !== before.text ? after.text.slice(0, 60) : null
          };
          await loc.fill('').catch(() => {});           // leave the form as we found it
        } catch (e) {
          f.blurValidation = { error: String(e.message || e).slice(0, 60) };
        }
      }
    }
  }

  // ── turn facts into findings ──
  const findings = [];
  for (const form of visibleInventory) {
    const where = form.name || form.el;
    if (!form.successElement && !form.redirect)
      findings.push({ form: where, severity: 'medium', confidence: 'suspected',
        issue: 'no discoverable static success state or redirect — submission was not exercised, so verify the live success path' });
    else if (form.successElement?.isWebflowDefault)
      findings.push({ form: where, severity: 'medium', confidence: 'measured',
        issue: `success message is still Webflow's default text ("${form.successElement.text}")` });
    if (!form.errorElement)
      findings.push({ form: where, severity: 'low', confidence: 'suspected',
        issue: 'no discoverable static error state — submission was not exercised, so verify the server-error path' });
    else if (form.errorElement.isWebflowDefault)
      findings.push({ form: where, severity: 'low', confidence: 'measured',
        issue: `error message is still Webflow's default text ("${form.errorElement.text}")` });
    if (!form.submitButton)
      findings.push({ form: where, severity: 'high', confidence: 'measured', issue: 'no submit button found' });
    else if (form.submitButton.disabled)
      findings.push({ form: where, severity: 'high', confidence: 'measured',
        issue: 'submit button is disabled — confirm there is a visible reason why' });
    if (!form.fieldCount)
      findings.push({ form: where, severity: 'high', confidence: 'measured', issue: 'form contains no visible fields' });
    if (form.novalidate)
      findings.push({ form: where, severity: 'medium', confidence: 'measured',
        issue: 'form has novalidate — all browser validation is switched off; custom validation must cover everything' });

    for (const f of form.fields) {
      if (!f.hasName) findings.push({ form: where, field: f.el, severity: 'high', confidence: 'measured',
        issue: 'field has no name attribute — its value is submitted nowhere and will never reach the inbox' });
      if (f.wrongTypeForEmail) findings.push({ form: where, field: f.el, severity: 'medium', confidence: 'measured',
        issue: `looks like an email field but type="${f.type}" — invalid addresses will be accepted` });
      if (f.wrongTypeForPhone) findings.push({ form: where, field: f.el, severity: 'low', confidence: 'measured',
        issue: `looks like a phone field but type="${f.type}" — mobile keyboards won't switch to the numeric pad` });
      if (!f.labelledBy) findings.push({ form: where, field: f.el, severity: 'medium', confidence: 'measured',
        issue: 'no label, aria-label or wrapping <label>' + (f.placeholder ? ' — a placeholder is not a label, it vanishes on focus' : '') });
      if (f.starredLabel && !f.required) findings.push({ form: where, field: f.el, severity: 'medium', confidence: 'measured',
        issue: `label is marked "*" but the field is not required — the asterisk is decorative` });
      if (f.fontSize && f.fontSize < 16) findings.push({ form: where, field: f.el, severity: 'low', confidence: 'measured',
        issue: `font-size ${f.fontSize}px — iOS Safari zooms the page on focus below 16px` });
      /* No inline feedback on blur is the norm, not a defect: the browser still refuses the
       * submit and shows its own message. Reporting it unconditionally fired on every
       * correctly-built form. It only becomes a real hole when `novalidate` has switched the
       * native pass off as well — then nothing validates anywhere, and the user is stuck with
       * no explanation. */
      const bv = f.blurValidation;
      if (bv && !bv.error && bv.nativeInvalid && !bv.visibleMessageAppeared && !bv.ariaInvalidSet && form.novalidate)
        findings.push({ form: where, field: f.el, severity: 'high', confidence: 'observed',
          issue: `invalid value ${bv.testedWith} produced no message, and the form has novalidate — ` +
                 'native validation is off and nothing replaced it, so bad input is never reported at all' });
    }
  }

  return {
    forms: visibleInventory.length,
    hiddenFormsDeferred: inventory.length - visibleInventory.length,
    note: 'No form was submitted. Fields were filled with deliberately invalid values to test ' +
          'blur validation and then cleared; submit was never clicked and Enter was never pressed.',
    findings, inventory
  };
}

async function snapshotMessages(page, formIndex) {
  return page.evaluate(i => {
    const form = document.querySelectorAll('form')[i];
    if (!form) return { count: 0, text: '' };
    const scope = form.closest('.w-form') || form;
    const msgs = Array.from(scope.querySelectorAll(
      '[class*="error"],[class*="invalid"],[role=alert],[aria-live],.w-form-fail'))
      .filter(el => { const c = getComputedStyle(el), r = el.getBoundingClientRect();
        return c.display !== 'none' && c.visibility !== 'hidden' && r.height > 0; });
    return { count: msgs.length, text: msgs.map(m => m.textContent.trim()).join(' | ').slice(0, 200) };
  }, formIndex);
}
