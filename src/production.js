/** One production transaction. The UI exposes editors only after this has run.
 * Services remain injectable so a failed download can never be marked complete.
 */
export const stages = [
  ['import', '원본 가져오기'], ['transcribe', '대사 인식'],
  ['direct', '제목·번역·컷 구성'], ['sound', '음향 배치'],
  ['render', '완성 영상 만들기'],
];
export class ProductionError extends Error {
  constructor(stage, cause, project) {
    super(cause.message || String(cause), { cause });
    this.stage = stage;
    this.project = project;
  }
}
export async function produceFromLink(url, services, { signal, onStage = () => {} } = {}) {
  // URL validation precedes all external calls.
  const canonical = youtubeURL(url);
  let project;
  for (const [stage] of stages) {
    signal?.throwIfAborted();
    onStage(stage, 'running');
    try {
      const next = await services[stage](stage === 'import' ? canonical : project, signal);
      signal?.throwIfAborted();
      if (stage === 'import') project = next;
      else if (next) project = next;
      if (!project) throw Error('제작 데이터가 비어 있습니다.');
      if (stage === 'render' && !(project.output instanceof Blob && project.output.size > 0))
        throw Error('완성 영상 파일을 확인하지 못했습니다.');
      onStage(stage, 'done');
    } catch (e) {
      onStage(stage, signal?.aborted ? 'cancelled' : 'failed');
      throw new ProductionError(stage, e, project);
    }
  }
  return project;
}
export function youtubeURL(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { throw Error('유튜브 영상 링크를 입력하세요.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw Error('https 유튜브 영상 링크를 입력하세요.');
  let id;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname))
    id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
  if (!/^[\w-]{11}$/.test(id || '')) throw Error('올바른 유튜브 영상 링크를 입력하세요.');
  return 'https://www.youtube.com/watch?v=' + id;
}
