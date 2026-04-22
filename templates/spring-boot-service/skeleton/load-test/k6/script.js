import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = JSON.parse(open('./config.json'));

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/hello`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body contains service': (r) => r.body.includes('__ARTIFACT_ID__'),
  });
  sleep(1);
}
