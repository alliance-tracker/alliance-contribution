export type AiUsageRow = { neurons: number; requests: number };

/** Per-UTC-day tally of Workers AI neurons spent by this Worker. A floor, not the account truth. */
export class AiUsageRepo {
  constructor(private db: D1Database) {}

  async get(day: string): Promise<AiUsageRow> {
    const row = await this.db
      .prepare("SELECT neurons, requests FROM ai_usage WHERE day = ?")
      .bind(day)
      .first<AiUsageRow>();
    return row ?? { neurons: 0, requests: 0 };
  }

  async add(day: string, neurons: number): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO ai_usage (day, neurons, requests) VALUES (?, ?, 1) " +
          "ON CONFLICT(day) DO UPDATE SET neurons = neurons + excluded.neurons, requests = requests + 1",
      )
      .bind(day, neurons)
      .run();
  }
}
