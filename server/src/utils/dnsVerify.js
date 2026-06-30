import dns from 'dns/promises';

/**
 * Checks whether the ownership TXT record for a domain is published and contains
 * the expected token. We look up `_eventlive-verify.<host>` and match any of the
 * returned TXT chunks against the token.
 *
 * @param {string} host  e.g. live.ramstudios.com
 * @param {string} token the domain's verifyToken
 * @returns {Promise<{ ok: boolean, found: string[] }>}
 */
export async function checkDnsTxt(host, token) {
  const name = `_eventlive-verify.${host}`;
  try {
    const records = await dns.resolveTxt(name); // string[][]
    const flat = records.map((chunks) => chunks.join('').trim());
    return { ok: flat.includes(token), found: flat };
  } catch {
    // NXDOMAIN / no records / DNS error → not verified (yet).
    return { ok: false, found: [] };
  }
}
