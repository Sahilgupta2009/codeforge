// Globals that isomorphic-git expects but React Native doesn't provide.
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
