# Minimal AVM2 ABC parser/disassembler (read-only); also records slot/const default values
import struct
class R:
    def __init__(s,b,o=0): s.b=b; s.o=o
    def u8(s): v=s.b[s.o]; s.o+=1; return v
    def u16(s): v=struct.unpack_from('<H',s.b,s.o)[0]; s.o+=2; return v
    def s24(s): v=int.from_bytes(s.b[s.o:s.o+3],'little',signed=True); s.o+=3; return v
    def u30(s):
        r=0;sh=0
        while True:
            x=s.b[s.o]; s.o+=1; r|=(x&0x7f)<<sh; sh+=7
            if not x&0x80 or sh>=35: return r
    def d(s): s.o+=8
U1={0x04,0x05,0x06,0x08,0x2c,0x2d,0x2e,0x2f,0x31,0x40,0x41,0x42,0x49,0x53,0x55,0x56,0x58,0x59,0x5a,0x5d,0x5e,0x5f,0x60,0x61,0x62,0x63,0x65,0x66,0x68,0x6a,0x6c,0x6d,0x6e,0x6f,0x80,0x86,0xb2,0x92,0x94,0xc2,0xc3,0xf0,0xf1,0x25}
U2={0x43,0x44,0x45,0x46,0x4a,0x4c,0x4e,0x4f,0x32}
NAMEOPS={0x04,0x05,0x59,0x5d,0x5e,0x5f,0x60,0x61,0x66,0x68,0x6a,0x80,0x86,0xb2,0x45,0x46,0x4a,0x4c,0x4e,0x4f}
OPN={0x5d:'findpropstrict',0x5e:'findproperty',0x60:'getlex',0x61:'setproperty',0x66:'getproperty',0x68:'initproperty',0x46:'callproperty',0x4f:'callpropvoid',0x4a:'constructprop',0x4c:'callproplex',0x2c:'pushstring',0x80:'coerce',0x04:'getsuper',0x05:'setsuper',0x45:'callsuper',0x4e:'callsupervoid',0x24:'pushbyte',0x25:'pushshort',0x2d:'pushint',0x10:'jump',0x11:'iftrue',0x12:'iffalse',0x40:'newfunction',0xd0:'getlocal0',0xd1:'getlocal1',0xd2:'getlocal2',0xd3:'getlocal3',0x47:'returnvoid'}
class ABC:
    def __init__(s,b):
        r=R(b); r.u16(); r.u16()
        n=r.u30(); s.ints=[0]+[r.u30() for _ in range(max(n-1,0))]
        n=r.u30(); [r.u30() for _ in range(max(n-1,0))]
        n=r.u30(); s.dbl=[0.0]
        for _ in range(max(n-1,0)): s.dbl.append(struct.unpack_from('<d',b,r.o)[0]); r.d()
        n=r.u30(); s.str=['']
        for _ in range(max(n-1,0)):
            l=r.u30(); s.str.append(b[r.o:r.o+l].decode('utf8','replace')); r.o+=l
        n=r.u30(); s.ns=[(0,0)]+[(r.u8(),r.u30()) for _ in range(max(n-1,0))]
        n=r.u30(); s.nss=[[]]
        for _ in range(max(n-1,0)): c=r.u30(); s.nss.append([r.u30() for _ in range(c)])
        n=r.u30(); s.mn=[None]
        for _ in range(max(n-1,0)):
            k=r.u8()
            if k in (7,13): s.mn.append(('q',r.u30(),r.u30()))
            elif k in (15,16): s.mn.append(('rq',0,r.u30()))
            elif k in (17,18): s.mn.append(('rql',0,0))
            elif k in (9,14): nm=r.u30(); s.mn.append(('m',r.u30(),nm))
            elif k in (27,28): s.mn.append(('ml',r.u30(),0))
            elif k==29: q=r.u30(); c=r.u30(); ps=[r.u30() for _ in range(c)]; s.mn.append(('t',q,ps))
            else: raise ValueError('mn kind %d'%k)
        n=r.u30(); s.meth=[]
        for _ in range(n):
            pc=r.u30(); r.u30(); [r.u30() for _ in range(pc)]; nm=r.u30(); fl=r.u8()
            if fl&8:
                oc=r.u30()
                for _ in range(oc): r.u30(); r.u8()
            if fl&0x80: [r.u30() for _ in range(pc)]
            s.meth.append(nm)
        n=r.u30()
        for _ in range(n):
            r.u30(); ic=r.u30()
            for _ in range(ic): r.u30(); r.u30()
        s.owner={}; s.consts={}
        n=r.u30(); s.inst=[]
        for i in range(n):
            nm=r.u30(); r.u30(); fl=r.u8()
            if fl&8: r.u30()
            ic=r.u30(); [r.u30() for _ in range(ic)]
            ii=r.u30(); cname=s.name(nm); s.inst.append(cname)
            s.owner[ii]=cname+'.<init>'; s.traits(r,cname,False)
        for i in range(n):
            ci=r.u30(); s.owner[ci]=s.inst[i]+'.<cinit>'; s.traits(r,s.inst[i],True)
        n=r.u30()
        for i in range(n):
            si=r.u30(); s.owner.setdefault(si,'script%d'%i); s.traits(r,'script%d'%i,True)
        n=r.u30(); s.bodies={}
        for _ in range(n):
            m=r.u30(); r.u30(); r.u30(); r.u30(); r.u30(); cl=r.u30()
            s.bodies[m]=b[r.o:r.o+cl]; r.o+=cl
            ec=r.u30()
            for _ in range(ec): [r.u30() for _ in range(5)]
            s.traits(r,s.owner.get(m,'?m%d'%m),False)
    def const(s,vi,vk):
        if not vi: return None
        if vk==3: return s.ints[vi] if vi<len(s.ints) else vi
        if vk==4: return ('uint',vi)
        if vk==6: return s.dbl[vi] if vi<len(s.dbl) else vi
        if vk==1: return s.str[vi]
        return {10:False,11:True,12:None}.get(vk,('kind',vk,vi))
    def name(s,i):
        if not i or i>=len(s.mn): return '*'
        m=s.mn[i]
        if m[0]=='t': return s.name(m[1])+'.<'+','.join(s.name(p) for p in m[2])+'>'
        return s.str[m[2]] if m[2] else '*'
    def qname(s,i):
        m=s.mn[i]
        if m and m[0]=='q':
            ns=s.str[s.ns[m[1]][1]]
            return (ns+':' if ns else '')+s.str[m[2]]
        return s.name(i)
    def traits(s,r,cname,static):
        n=r.u30()
        for _ in range(n):
            nm=r.u30(); k=r.u8(); kind=k&15
            if kind in (0,6):
                r.u30(); r.u30(); vi=r.u30(); vk=r.u8() if vi else None
                s.consts.setdefault(cname,{})[s.name(nm)]=s.const(vi,vk)
            elif kind in (1,2,3):
                r.u30(); m=r.u30(); pre={1:'',2:'get ',3:'set '}[kind]
                s.owner[m]=cname+('.static ' if static else '.')+pre+s.name(nm)
            elif kind in (4,5): r.u30(); r.u30()
            if k>>4 & 4:
                c=r.u30(); [r.u30() for _ in range(c)]
    def dis(s,code):
        r=R(code); out=[]
        while r.o<len(code):
            pos=r.o; op=r.u8()
            if op in U1:
                a=r.u30()
                if op==0x2c: out.append((pos,'pushstring',repr(s.str[a])))
                elif op in NAMEOPS: out.append((pos,OPN.get(op,'op%02x'%op),s.name(a)))
                elif op in (0x2d,): out.append((pos,'pushint',s.ints[a] if a<len(s.ints) else a))
                elif op==0x2f: out.append((pos,'pushdouble',s.dbl[a] if a<len(s.dbl) else a))
                elif op==0x25: out.append((pos,'pushshort',a))
                elif op==0x62: out.append((pos,'getlocal',a))
                elif op==0x40: out.append((pos,'newfunction',a))
                elif op in (0xf0,0xf1): pass
                else: out.append((pos,'op%02x'%op,a))
            elif op in U2:
                a=r.u30(); c=r.u30()
                if op in NAMEOPS: out.append((pos,OPN.get(op,'op%02x'%op),s.name(a)+'(%d)'%c))
                else: out.append((pos,'op%02x'%op,a,c))
            elif op==0x24: out.append((pos,'pushbyte',int.from_bytes(bytes([r.u8()]),'little',signed=True)))
            elif 0x0c<=op<=0x1a: off=r.s24(); out.append((pos,OPN.get(op,'br%02x'%op),pos+4+off))
            elif op==0x1b:
                r.s24(); c=r.u30(); [r.s24() for _ in range(c+1)]; out.append((pos,'lookupswitch'))
            elif op==0xef: r.u8(); r.u30(); r.u8(); r.u30()
            else: out.append((pos,OPN.get(op,'op%02x'%op)))
        return out
