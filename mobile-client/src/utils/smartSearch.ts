export const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return previous[right.length];
};

const tokenScore = (queryToken: string, candidateToken: string) => {
  if (queryToken === candidateToken) return 120;
  if (candidateToken.startsWith(queryToken)) return 105;
  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) return 90;
  if (candidateToken.length >= 3 && queryToken.startsWith(candidateToken)) return 75;

  if (queryToken.length < 4 || candidateToken.length < 4) return -1;
  const allowedErrors = queryToken.length >= 8 ? 2 : 1;
  const distance = editDistance(queryToken, candidateToken);
  return distance <= allowedErrors ? 65 - distance * 10 : -1;
};

/** Returns -1 when there is no safe match; larger values are more relevant. */
export const smartSearchScore = (query: string, values: Array<string | null | undefined>) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const searchableText = normalizeSearchText(values.filter(Boolean).join(' '));
  if (!searchableText) return -1;
  if (searchableText.includes(normalizedQuery)) return 1000 - searchableText.indexOf(normalizedQuery);

  const queryTokens = normalizedQuery.split(' ');
  const candidateTokens = searchableText.split(' ');
  let total = 0;

  for (const queryToken of queryTokens) {
    const best = candidateTokens.reduce(
      (score, candidateToken) => Math.max(score, tokenScore(queryToken, candidateToken)),
      -1,
    );
    if (best < 0) return -1;
    total += best;
  }

  return total;
};
