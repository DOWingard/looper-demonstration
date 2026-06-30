// Cross-reference the "since you last looked" digest with live session status (o5). The
// digest says what each session DID while away; this annotates each with what it now IS,
// and hoists the sessions currently waiting on the operator into one flat, jump-ready
// "needs you now" list with directory provenance — so the away view answers both
// "what happened" and "what needs me" at a glance. Pure.

export function annotateDigest(digest, statusByKey = {}) {
  const needsYou = [];
  const groups = (digest?.groups || []).map((g) => {
    const sessions = (g.sessions || []).map((s) => {
      const key = s.sessionKey || s.key;
      const status = statusByKey[key] || null;
      const entry = { ...s, status };
      if (status === 'waiting') needsYou.push({ ...entry, cwd: g.cwd, label: g.label });
      return entry;
    });
    const waiting = sessions.filter((s) => s.status === 'waiting').length;
    return { ...g, sessions, waiting };
  });
  return { ...digest, groups, needsYou, needsYouCount: needsYou.length };
}
