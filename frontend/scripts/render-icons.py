"""Rasterise the flag mark onto a tile. Pure stdlib: no image deps in this repo."""
import zlib, struct, sys

# Top edge of the flag in a 0..100 x 0..100 box (traced from the reference logo).
TOP = [ (0,15.1), (8,4),(16,0),(26,0), (40,0),(52,15.7),(72,15.7), (84,15.7),(92,8),(100,0) ]
BAND = 83.8   # bottom edge is the same wave, this far below

def bez(p0,p1,p2,p3,t):
    u=1-t
    return (u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],
            u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1])

def edge_points(n=400):
    pts=[]
    segs=[(TOP[0],TOP[1],TOP[2],TOP[3]),(TOP[3],TOP[4],TOP[5],TOP[6]),(TOP[6],TOP[7],TOP[8],TOP[9])]
    for s in segs:
        for i in range(n+1):
            pts.append(bez(*s,i/n))
    return pts

def polygon():
    top=edge_points()
    bot=[(x,y+BAND) for x,y in reversed(top)]
    return top+bot

def fill(size, poly, ss=4):
    """Scanline fill with ss x ss supersampling; returns coverage 0..1 per pixel."""
    W=size*ss
    scaled=[(x/100*W, y/100*W) for x,y in poly]
    cov=[0.0]*(size*size)
    for sy in range(W):
        yc=sy+0.5
        xs=[]
        for i in range(len(scaled)):
            x0,y0=scaled[i]; x1,y1=scaled[(i+1)%len(scaled)]
            if (y0<=yc<y1) or (y1<=yc<y0):
                xs.append(x0+(yc-y0)*(x1-x0)/(y1-y0))
        xs.sort()
        row=(sy//ss)*size
        for i in range(0,len(xs)-1,2):
            a,b=xs[i],xs[i+1]
            for sx in range(max(0,int(a)),min(W,int(b)+1)):
                if a<=sx+0.5<b: cov[row+sx//ss]+=1
    return [c/(ss*ss) for c in cov]

def png(path,size,cov,ground,glyph,inset):
    """Composite the coverage mask over an opaque ground. iOS masks its own corners,
    and any alpha would be composited onto black, so this stays fully opaque."""
    rows=bytearray()
    off=int(size*inset)
    inner=size-2*off
    for y in range(size):
        rows.append(0)
        for x in range(size):
            gx,gy=x-off,y-off
            c=cov[gy*inner+gx] if 0<=gx<inner and 0<=gy<inner else 0.0
            rows.extend(bytes(int(round(g+(f-g)*c)) for g,f in zip(ground,glyph)))
    def chunk(t,d):
        return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    hdr=struct.pack('>IIBBBBB',size,size,8,2,0,0,0)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',hdr)+
        chunk(b'IDAT',zlib.compress(bytes(rows),9))+chunk(b'IEND',b''))

GROUND=(0x1c,0x1c,0x22)
GLYPH=(0xf5,0xf2,0xec)
INSET=0.19   # glyph occupies the middle 62%, well clear of the squircle mask

if __name__=='__main__':
    poly=polygon()
    for size in (180,192,512,32):
        inner=size-2*int(size*INSET)
        cov=fill(inner,poly)
        name={180:'apple-touch-icon.png',192:'icon-192.png',512:'icon-512.png',32:'favicon.png'}[size]
        png(sys.argv[1]+'/'+name,size,cov,GROUND,GLYPH,INSET)
        print(name)
