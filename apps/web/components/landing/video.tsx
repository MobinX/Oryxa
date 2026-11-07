export function LandingVideo({ companyName }: { companyName: string }) {
  return (
    <section
      id="video"
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '88px 32px 24px',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--oo-accent)', fontWeight: 600 }}>Watch</div>
      <h2
        style={{
          margin: '10px 0 12px',
          fontSize: 48,
          lineHeight: 1.05,
          letterSpacing: '-0.035em',
          fontWeight: 700,
        }}
      >
        See {companyName} in action.
      </h2>
      <p style={{ margin: '0 auto 36px', maxWidth: 560, color: 'var(--oo-muted)', fontSize: 18 }}>
        A short look at how DMs and comments turn into confirmed orders.
      </p>
      <div
        style={{
          position: 'relative',
          padding: 1,
          borderRadius: 30,
          background: 'linear-gradient(180deg, var(--oo-lineStrong), transparent 90%)',
          boxShadow: '0 40px 100px var(--oo-halo)',
        }}
      >
        <div
          style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            borderRadius: 29,
            overflow: 'hidden',
            background: 'var(--oo-surface2)',
          }}
        >
          <video
            src="/landing/onlyorders-commercial.mp4"
            controls
            preload="metadata"
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              background: '#000',
            }}
          />
        </div>
      </div>
    </section>
  );
}
