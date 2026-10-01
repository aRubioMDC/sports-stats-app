export function Disclaimer() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-4xl font-bold text-white">Legal Notice and Disclaimer</h1>
      <div className="space-y-6 text-white/80">
        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">1. HitRate is informational only</h2>
          <p>
            HitRate provides sports statistics analysis, player trends, and probability tools. It is not professional,
            financial, legal, or medical advice.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">2. It is not betting advice</h2>
          <p className="mb-3">
            Although HitRate may be used for sports betting analysis, <strong>it is not betting advice</strong>. This
            means:
          </p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>Predictions and analysis are informational and not guaranteed.</li>
            <li>Sports betting carries real financial risk.</li>
            <li>We do not guarantee winnings or specific outcomes.</li>
            <li>You must make your own informed decisions.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">3. Responsible gaming</h2>
          <p className="mb-3">If you participate in sports betting, do so responsibly:</p>
          <ul className="ml-5 space-y-2 list-disc">
            <li>Bet only money you can afford to lose.</li>
            <li>Do not treat betting as a way to make income.</li>
            <li>Set personal limits and stick to them.</li>
            <li>If you have a gambling problem, seek professional help.</li>
          </ul>
          <p className="mt-3">
            <strong>Resources:</strong>{" "}
            <a href="https://www.ncpgambling.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
              NCPG (National Council on Problem Gambling)
            </a>
            {" "}or local support services in your country.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">4. Data accuracy</h2>
          <p>
            HitRate uses data from public and licensed sources. While we aim to maintain accuracy, we do not guarantee
            that data is 100% exact, complete, or updated in real time. Always verify with official league sources before
            making important decisions.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">5. Unexpected changes</h2>
          <p>
            Statistics, injuries, lineup changes, and other factors can change at any time and affect the analysis.
            HitRate is not responsible for changes that occur after data has been loaded.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">6. No warranties</h2>
          <p>
            HitRate is provided "as is" without warranties. We do not guarantee uptime, accuracy, security, or
            compliance with any specific requirements. To the maximum extent permitted by law, we are not responsible for
            financial losses or damages arising from use of the app.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">7. Regulatory compliance</h2>
          <p>
            It is your responsibility to verify that sports betting use complies with the laws of your jurisdiction.
            Regulations vary by country, state, and region. HitRate is not responsible for legal violations.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">8. No affiliation</h2>
          <p>
            HitRate is not affiliated with, sponsored by, or endorsed by sports leagues (NFL, NHL, etc.), teams, or
            sportsbooks. We are not a betting operator.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">9. Changes to this Disclaimer</h2>
          <p>
            We may update this Disclaimer at any time. Continued use of HitRate constitutes acceptance of the current
            terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-semibold text-white">10. Contact</h2>
          <p>
            If you have questions about this Disclaimer, contact{" "}
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
