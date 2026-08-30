import { useEffect, useState } from 'react';
import styles from './Backdrop.module.css';

interface BackdropProps {
  /** Artwork for what is playing, or null when there is nothing to take colour from. */
  image: string | null;
}

/**
 * Tints the whole viewport with the current album art.
 *
 * Two layers rather than one, because swapping the `src` of a single image would cut to
 * the new artwork instantly. The outgoing cover stays mounted underneath while the
 * incoming one fades in over it, so the room changes colour rather than flicking. With
 * nothing playing both fade out and the plain canvas is all that is left.
 *
 * Nothing here samples the image. The art is served either by the streamer or by whichever
 * service it came from, so a canvas read would be cross-origin tainted; the blur does the
 * work in CSS instead, which needs no such access.
 */
export function Backdrop({ image }: BackdropProps) {
  const [layers, setLayers] = useState<string[]>([]);

  useEffect(() => {
    if (image === null) return;
    // Keep the outgoing artwork mounted so there is something to cross-fade from; anything
    // older than that is completely covered and only costs a decode.
    setLayers((current) =>
      current[current.length - 1] === image ? current : [...current.slice(-1), image],
    );
  }, [image]);

  const drop = (src: string) => setLayers((current) => current.filter((layer) => layer !== src));

  return (
    <div className={styles.backdrop} aria-hidden="true">
      {layers.map((src) => (
        <Layer key={src} src={src} shown={src === image} onFail={() => drop(src)} />
      ))}
      <div className={styles.scrim} />
      <div className={styles.vignette} />
    </div>
  );
}

/** One artwork layer. It only fades in once the image has actually decoded. */
function Layer({ src, shown, onFail }: { src: string; shown: boolean; onFail: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      className={`${styles.layer} ${loaded && shown ? styles.visible : ''}`}
      src={src}
      alt=""
      onLoad={() => setLoaded(true)}
      onError={onFail}
    />
  );
}
