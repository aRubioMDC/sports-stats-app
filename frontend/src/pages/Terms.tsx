export function Terms() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-4xl font-bold text-white">Terms of Service</h1>
      <div className="space-y-6 text-white/80">
        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">1. Acceptance of Terms</h2>
          <p>
            By using HitRate, you agree to these Terms of Service. If you do not agree, please do not use the app.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">2. Acceptable Use</h2>
          <p className="mb-3">You agree to:</p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>Use the app only for lawful and authorized purposes.</li>
            <li>Not interfere with the operation of the app or its servers.</li>
            <li>Not attempt to access data without authorization.</li>
            <li>Not use the app to harass, defame, or discriminate against others.</li>
            <li>Comply with all applicable laws and regulations.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">3. Limitation of Liability</h2>
          <p className="mb-3">
            HitRate is provided "as is." We do not guarantee it will be error-free, uninterrupted, or meet your
            specific expectations. To the maximum extent permitted by law:
          </p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>
              We are not liable for direct, indirect, incidental, special, or consequential damages arising from the use
              of the app.
            </li>
            <li>Our total liability is limited to the maximum amount you paid for the service (zero if it is free).</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">4. Intellectual Property</h2>
          <p>
            All content in HitRate (code, design, data, logos) is owned by HitRate or its licensors. You may not
            reproduce, modify, or distribute it without explicit permission.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">5. Third-Party Data</h2>
          <p className="mb-3">
            HitRate uses data from public and licensed sources (for example, sports statistics and team information).
            This data is subject to its own licensing terms:
          </p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>
              <strong>No affiliation:</strong> HitRate is not affiliated with, sponsored by, or endorsed by sports
              leagues such as the NFL or NHL.
            </li>
            <li>
              <strong>Use of brands:</strong> Team names, logos, and trademarks remain the property of their respective
              organizations.
            </li>
            <li>
              <strong>Data changes:</strong> We do not guarantee absolute real-time accuracy. Verify with official sources
              as needed.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">6. Service Modifications</h2>
          <p>
            We reserve the right to modify, suspend, or discontinue HitRate at any time. We will make a reasonable
            effort to notify you of significant changes.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">7. Indemnification</h2>
          <p>
            You agree to indemnify us against any claims, damages, or costs (including legal fees) arising from your
            breach of these Terms or misuse of the app.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">8. Governing Law</h2>
          <p>
            These Terms are governed by the laws applicable in Mexico or your local jurisdiction, and disputes may be
            subject to binding arbitration.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">9. Changes to These Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the app constitutes acceptance of the current terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">10. Contact</h2>
          <p>
            If you have questions about these Terms, contact{" "}
            <a href="mailto:legal@hitrate.app" className="text-emerald-400 hover:underline">
              legal@hitrate.app
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
