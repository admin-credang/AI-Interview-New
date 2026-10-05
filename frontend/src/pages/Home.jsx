import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: 'Plus Jakarta Sans', sans-serif;
          background: #030712;
          color: #f8fafc;
        }

        .home-page {
          min-height: 100vh;
          background: radial-gradient(circle at 15% 15%, rgba(13, 148, 136, 0.25) 0%, transparent 45%),
                      radial-gradient(circle at 85% 85%, rgba(244, 63, 94, 0.2) 0%, transparent 45%),
                      #030712;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
        }

        .hero-container {
          max-width: 1200px;
          width: 100%;
          text-align: center;
          padding: 60px 20px;
        }

        .badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(13, 148, 136, 0.12);
          border: 1px solid rgba(20, 184, 166, 0.3);
          color: #2dd4bf;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 24px;
          box-shadow: 0 0 20px rgba(13, 148, 136, 0.2);
        }

        .hero-title {
          font-size: clamp(36px, 5vw, 60px);
          font-weight: 800;
          line-height: 1.15;
          margin-bottom: 20px;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .hero-title span {
          background: linear-gradient(135deg, #2dd4bf 0%, #06b6d4 50%, #f43f5e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-subtitle {
          font-size: clamp(16px, 2vw, 18px);
          color: #94a3b8;
          max-width: 700px;
          margin: 0 auto 40px;
          line-height: 1.6;
        }

        .cta-group {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 60px;
          flex-wrap: wrap;
        }

        .primary-btn {
          background: linear-gradient(135deg, #0d9488 0%, #06b6d4 100%);
          color: white;
          border: none;
          padding: 16px 36px;
          font-size: 16px;
          font-weight: 700;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 10px 25px -5px rgba(13, 148, 136, 0.5);
        }

        .primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px -5px rgba(13, 148, 136, 0.7);
        }

        .secondary-btn {
          background: rgba(15, 23, 42, 0.6);
          color: #f1f5f9;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 16px 36px;
          font-size: 16px;
          font-weight: 700;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .secondary-btn:hover {
          background: rgba(30, 41, 59, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          max-width: 1200px;
          width: 100%;
          padding: 0 20px 80px;
        }

        .feature-card {
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(20, 184, 166, 0.15);
          border-radius: 24px;
          padding: 32px;
          text-align: left;
          transition: transform 0.25s ease, border-color 0.25s ease;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          border-color: rgba(45, 212, 191, 0.4);
        }

        .feature-icon {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          background: rgba(13, 148, 136, 0.15);
          border: 1px solid rgba(45, 212, 191, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          margin-bottom: 20px;
        }

        .feature-title {
          font-size: 20px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 10px;
        }

        .feature-desc {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.6;
        }
      `}</style>

      <div className="hero-container">
        <div className="badge-pill">
          <span>✨ Next-Gen AI Interview Platform</span>
        </div>
        <h1 className="hero-title">
          Master Your Next Tech Interview With <span>IntelliView OS</span>
        </h1>
        <p className="hero-subtitle">
          Experience real-time voice conversations, intelligent question flows, and comprehensive AI evaluations designed to supercharge your career readiness.
        </p>

        <div className="cta-group">
          <button className="primary-btn" onClick={() => navigate("/dashboard")}>
            Get Started / Dashboard
          </button>
          <button className="secondary-btn" onClick={() => navigate("/interviews")}>
            Explore Interviews
          </button>
        </div>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🎙️</div>
          <div className="feature-title">Real-Time Voice AI</div>
          <div className="feature-desc">
            Engage in natural, spoken conversations with our advanced AI interviewer using speech recognition and synthesis.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <div className="feature-title">Dynamic Prompts</div>
          <div className="feature-desc">
            Questions adapt on the fly based on your responses, ensuring a thorough and realistic technical assessment.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <div className="feature-title">Instant Analytics</div>
          <div className="feature-desc">
            Get detailed performance breakdowns and reports immediately after concluding your practice session.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;