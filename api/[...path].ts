import {createAPI} from '../server/api.ts';
import {vercelRepository} from '../server/vercel-repository.ts';

const api = createAPI(vercelRepository(), process.env);
export default {
 fetch(request:Request) {
  const ip = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for'))?.split(',')[0].trim() ?? 'unknown';
  return api(request, ip);
 }
};
