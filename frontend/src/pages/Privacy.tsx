export function Privacy() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-4xl font-bold text-white">Privacy Policy</h1>
      <div className="space-y-6 text-white/80">
        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">1. Introduction</h2>
          <p>
            HitRate ("we", "our" or "the App") respects your privacy. This Privacy Policy explains how we collect,
            use, and protect your information.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">2. Information We Collect</h2>
          <p className="mb-3">Currently, HitRate does not require account registration or authentication. However:</p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>
              <strong>Local browser storage (localStorage):</strong> Your browser stores preferences such as selected
              sport and bankroll locally. This data is not sent to our servers.
            </li>
            <li>
              <strong>Event analytics:</strong> We record anonymous events (for example, page visits and filter usage) to
              understand how the app is used. These do not contain personally identifying information.
            </li>
            <li>
              <strong>Server logs:</strong> We keep standard access logs (IP address, user agent, etc.) for security and
              troubleshooting.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">3. Cookies</h2>
          <p className="mb-3">
            <strong>We currently do not use cookies.</strong> Session-related information is kept locally in your browser
            using localStorage, which is more privacy-friendly by default.
          </p>
          <p>
            If we add login, third-party analytics, or other features in the future, we will use cookies transparently
            and disclose this clearly before implementation.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">4. Use of Data</h2>
          <p className="mb-3">Data is used only to:</p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>Improve the user experience and app performance.</li>
            <li>Diagnose and fix technical issues.</li>
            <li>Understand usage trends in an anonymous way.</li>
            <li>Fulfill legal and operational obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">5. Third Parties</h2>
          <p>
            We do not share your data with third parties. If we integrate third-party services in the future (for
            example, Google Analytics), we will do so transparently and with respect for your privacy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">6. Security</h2>
          <p>
            We protect your data with industry-standard safeguards such as HTTPS and encryption. However, no internet
            transmission is ever 100% secure.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">7. Your Rights</h2>
          <p className="mb-3">You have the right to:</p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>Access the data we hold about you.</li>
            <li>Request correction or deletion of your data.</li>
            <li>Limit how we use your information.</li>
            <li>Exercise your right to be forgotten.</li>
          </ul>
          <p className="mt-3">
            To exercise these rights, contact{" "}
            <a href="mailto:privacy@hitrate.app" className="text-emerald-400 hover:underline">
              privacy@hitrate.app
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">8. Changes to This Policy</h2>
          <p>
            We may update this policy at any time. Material changes will be communicated within the app.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">9. Contact</h2>
          <p>
            If you have privacy questions, contact{" "}
            <a href="mailto:privacy@hitrate.app" className="text-emerald-400 hover:underline">
              privacy@hitrate.app
            </a>
            .
          </p>
        </section>

        <div className="mt-8 border-t border-white/10 pt-4 text-xs text-white/50">
          <p>Last updated: October 2026</p>
        </div>
      </div>
    </div>
  );
}
