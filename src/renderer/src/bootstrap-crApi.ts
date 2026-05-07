/** 必须在入口最顶部 import，确保早于 App 等模块执行（避免仍有环境未注入桩）。 */
import { ensureCrApiBrowserStub } from './setup-crApi-browser-stub';

ensureCrApiBrowserStub();
