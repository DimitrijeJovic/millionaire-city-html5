"""Minimal Chrome DevTools Protocol client over a local websocket (stdlib only)."""
import base64
import json
import os
import socket
import struct
import time
import urllib.request


class CDP:
    def __init__(self, ws_url, timeout=60):
        host_port, path = ws_url[len('ws://'):].split('/', 1)
        host, port = host_port.split(':')
        self.s = socket.create_connection((host, int(port)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(('GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                        'Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n' % (path, host_port, key)).encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.s.recv(4096)
        if b' 101 ' not in buf.split(b'\r\n')[0]:
            raise RuntimeError(buf[:200])
        self.rest = buf.split(b'\r\n\r\n', 1)[1]
        self.id = 0
        self.events = []

    def _recv_exact(self, n):
        chunks = [self.rest]
        have = len(self.rest)
        while have < n:
            c = self.s.recv(1 << 20)
            if not c:
                raise EOFError
            chunks.append(c)
            have += len(c)
        data = b''.join(chunks)
        self.rest = data[n:]
        return data[:n]

    def _recv_msg(self):
        data = b''
        while True:
            b0, b1 = self._recv_exact(2)
            ln = b1 & 0x7F
            if ln == 126:
                ln = struct.unpack('>H', self._recv_exact(2))[0]
            elif ln == 127:
                ln = struct.unpack('>Q', self._recv_exact(8))[0]
            payload = self._recv_exact(ln)
            op = b0 & 0x0F
            if op == 8:
                raise EOFError('closed')
            if op == 9:
                self._frame(0xA, payload)
                continue
            if op in (0, 1, 2):
                data += payload
                if b0 & 0x80:
                    return data.decode('utf-8', 'replace')

    def _frame(self, opcode, msg):
        n = len(msg)
        hdr = bytes([0x80 | opcode])
        if n < 126:
            hdr += bytes([0x80 | n])
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack('>H', n)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack('>Q', n)
        mask = os.urandom(4)
        k = int.from_bytes((mask * (n // 4 + 1))[:n], 'big')
        self.s.sendall(hdr + mask + ((int.from_bytes(msg, 'big') ^ k).to_bytes(n, 'big') if n else b''))

    def send(self, method, params=None, timeout=120):
        self.id += 1
        msg = json.dumps({'id': self.id, 'method': method, 'params': params or {}}).encode()
        n = len(msg)
        hdr = bytes([0x81])
        if n < 126:
            hdr += bytes([0x80 | n])
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack('>H', n)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack('>Q', n)
        mask = os.urandom(4)
        k = int.from_bytes((mask * (n // 4 + 1))[:n], 'big')
        masked = (int.from_bytes(msg, 'big') ^ k).to_bytes(n, 'big')
        self.s.sendall(hdr + mask + masked)
        end = time.time() + timeout
        while time.time() < end:
            m = json.loads(self._recv_msg())
            if m.get('id') == self.id:
                if 'error' in m:
                    raise RuntimeError('%s: %s' % (method, m['error']))
                return m.get('result', {})
            self.events.append(m)
        raise TimeoutError(method)

    def eval(self, expr, timeout=120):
        r = self.send('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True}, timeout)
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'])
        return r.get('result', {}).get('value')


def page_ws(port, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            for t in json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % port, timeout=5)):
                if t.get('type') == 'page':
                    return t['webSocketDebuggerUrl']
        except OSError:
            pass
        time.sleep(0.3)
    raise TimeoutError('no page target on port %d' % port)
