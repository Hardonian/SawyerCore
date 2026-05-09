import * as fs from 'fs';
import * as path from 'path';

export interface IntelligenceRule {
  id: string;
  condition: string;
  action: string;
  version: number;
}

export class PolicyRuleEngine {
  private rulesFile: string;
  private rules: IntelligenceRule[] = [];

  constructor(rulesFile: string = path.join(process.cwd(), 'data', 'policies', 'rules.json')) {
    this.rulesFile = rulesFile;
    this.loadRules();
  }

  private loadRules() {
    if (fs.existsSync(this.rulesFile)) {
      const data = fs.readFileSync(this.rulesFile, 'utf-8');
      this.rules = JSON.parse(data);
    } else {
      this.ensureDir();
      this.rules = [
        {
          id: 'R-001',
          condition: 'low-memory',
          action: 'force small model',
          version: 1
        }
      ];
      this.saveRules();
    }
  }

  private ensureDir() {
    const dir = path.dirname(this.rulesFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public saveRules() {
    this.ensureDir();
    fs.writeFileSync(this.rulesFile, JSON.stringify(this.rules, null, 2));
  }

  public evaluate(context: Record<string, any>): string[] {
    const actions: string[] = [];
    for (const rule of this.rules) {
      // Deterministic explainable rules
      if (rule.condition === 'low-memory' && context.memory < 1024 * 1024 * 500) {
        actions.push(rule.action);
      }
      if (rule.condition === 'provider-fails-twice' && context.providerFailures >= 2) {
        actions.push(rule.action);
      }
    }
    return actions;
  }

  public addRule(rule: IntelligenceRule) {
    this.rules.push(rule);
    this.saveRules();
  }
}
