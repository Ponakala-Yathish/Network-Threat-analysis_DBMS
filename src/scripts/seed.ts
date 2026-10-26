#!/usr/bin/env node
// Database Seed Script
// Run with: npx tsx src/scripts/seed.ts

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, transaction, closePool } from '../lib/db.js';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');
  
  try {
    // Hash passwords
    const adminHash = await bcrypt.hash('admin123', 12);
    const analystHash = await bcrypt.hash('analyst123', 12);
    
    await transaction(async (client) => {
      // Seed Users
      console.log('  👤 Seeding users...');
      await client.query(`
        INSERT INTO Users (username, password_hash, role) VALUES
        ('admin', $1, 'Admin'),
        ('analyst', $2, 'Analyst')
        ON CONFLICT (username) DO NOTHING
      `, [adminHash, analystHash]);
      
      // Seed Network Assets
      console.log('  🖥️  Seeding network assets...');
      await client.query(`
        INSERT INTO Network_Assets (internal_ip, hostname, criticality, department) VALUES
        ('10.0.1.10', 'web-server-01', 9, 'DMZ'),
        ('10.0.1.11', 'web-server-02', 8, 'DMZ'),
        ('10.0.1.20', 'app-server-01', 7, 'Application'),
        ('10.0.1.21', 'app-server-02', 7, 'Application'),
        ('10.0.1.30', 'db-primary', 10, 'Database'),
        ('10.0.1.31', 'db-replica', 8, 'Database'),
        ('10.0.2.10', 'file-server', 5, 'Storage'),
        ('10.0.2.20', 'backup-server', 4, 'Storage'),
        ('10.0.3.10', 'dc-primary', 10, 'Infrastructure'),
        ('10.0.3.11', 'dc-secondary', 9, 'Infrastructure'),
        ('10.0.4.10', 'workstation-hr', 3, 'HR'),
        ('10.0.4.11', 'workstation-finance', 4, 'Finance'),
        ('10.0.4.12', 'workstation-engineering', 3, 'Engineering'),
        ('10.0.4.13', 'workstation-sales', 2, 'Sales'),
        ('10.0.4.14', 'workstation-marketing', 2, 'Marketing')
        ON CONFLICT (internal_ip) DO NOTHING
      `);
      
      // Seed Security Playbooks (without vectors - will be added by embedding service)
      console.log('  📚 Seeding security playbooks...');
      await client.query(`
        INSERT INTO Security_Playbooks (title, threat_category, description, mitigation, tags) VALUES
        (
          'Brute Force Attack Mitigation',
          'Credential Access',
          'Attacker attempts multiple password combinations to gain unauthorized access to systems.',
          '1. Implement account lockout after 5 failed attempts\n2. Enforce strong password policies\n3. Enable multi-factor authentication (MFA)\n4. Monitor and alert on failed login patterns\n5. Block offending IPs at firewall level\n6. Review and rotate compromised credentials',
          ARRAY['brute-force', 'authentication', 'credential-access', 'mitre-t1110']
        ),
        (
          'SQL Injection Prevention',
          'Initial Access',
          'Attacker injects malicious SQL code through application input fields to manipulate database queries.',
          '1. Use parameterized queries/prepared statements\n2. Implement input validation and sanitization\n3. Apply least privilege database permissions\n4. Deploy Web Application Firewall (WAF)\n5. Regular security code reviews\n6. Monitor for unusual database error patterns',
          ARRAY['sql-injection', 'web-application', 'initial-access', 'mitre-t1190']
        ),
        (
          'DDoS Attack Response',
          'Availability',
          'Distributed Denial of Service attack overwhelms network resources with malicious traffic.',
          '1. Activate DDoS mitigation service (Cloudflare, AWS Shield)\n2. Implement rate limiting at network edge\n3. Configure traffic filtering and scrubbing\n4. Scale infrastructure horizontally\n5. Establish traffic baseline for anomaly detection\n6. Coordinate with ISP for upstream filtering',
          ARRAY['ddos', 'availability', 'network', 'mitre-t1498']
        ),
        (
          'Malware Infection Response',
          'Execution',
          'Malicious software executes on endpoints, potentially spreading across the network.',
          '1. Isolate affected systems from network\n2. Identify malware variant via IOCs\n3. Run automated malware scans\n4. Remove persistence mechanisms\n5. Restore from clean backups\n6. Update endpoint protection signatures\n7. Conduct root cause analysis',
          ARRAY['malware', 'execution', 'endpoint', 'mitre-t1204']
        ),
        (
          'Phishing Attack Response',
          'Initial Access',
          'Attacker sends deceptive emails to trick users into revealing credentials or downloading malware.',
          '1. Block sender domains at email gateway\n2. Remove phishing emails from all inboxes\n3. Reset credentials for compromised accounts\n4. Enable MFA for affected users\n5. Conduct targeted security awareness training\n6. Update email filtering rules\n7. Report to relevant authorities',
          ARRAY['phishing', 'social-engineering', 'initial-access', 'mitre-t1566']
        ),
        (
          'Ransomware Incident Response',
          'Impact',
          'Malware encrypts files and demands ransom for decryption key.',
          '1. Immediately isolate infected systems\n2. Identify ransomware variant\n3. Check for available decryptors (No More Ransom)\n4. Restore from offline, verified backups\n5. Do NOT pay ransom (no guarantee of recovery)\n6. Engage incident response team\n7. Report to law enforcement\n8. Conduct post-incident review',
          ARRAY['ransomware', 'impact', 'encryption', 'mitre-t1486']
        ),
        (
          'Insider Threat Detection',
          'Collection',
          'Authorized user misuses access privileges to exfiltrate sensitive data.',
          '1. Implement Data Loss Prevention (DLP)\n2. Monitor anomalous data access patterns\n3. Enforce least privilege access\n4. Deploy User Behavior Analytics (UBA)\n5. Regular access reviews and certification\n6. Implement privileged access management\n7. Conduct exit procedures for departing employees',
          ARRAY['insider-threat', 'data-exfiltration', 'collection', 'mitre-t1005']
        ),
        (
          'Man-in-the-Middle Attack',
          'Credential Access',
          'Attacker intercepts communication between two parties to steal or manipulate data.',
          '1. Enforce TLS 1.2+ for all communications\n2. Implement certificate pinning\n3. Use VPN for remote access\n4. Deploy network segmentation\n5. Monitor for ARP spoofing/poisoning\n6. Use mutual TLS for service-to-service\n7. Educate users on certificate warnings',
          ARRAY['mitm', 'credential-access', 'network', 'mitre-t1557']
        ),
        (
          'Zero-Day Exploit Response',
          'Initial Access',
          'Attacker exploits unknown vulnerability before patch is available.',
          '1. Apply virtual patching via WAF/IPS\n2. Implement network segmentation\n3. Increase monitoring for exploit indicators\n4. Disable vulnerable services if possible\n5. Apply vendor patch immediately when released\n6. Conduct vulnerability assessment\n7. Update threat intelligence feeds',
          ARRAY['zero-day', 'vulnerability', 'initial-access', 'mitre-t1190']
        ),
        (
          'Credential Stuffing Defense',
          'Credential Access',
          'Attacker uses leaked credentials from other breaches to attempt login.',
          '1. Implement rate limiting on login endpoints\n2. Deploy credential leak monitoring\n3. Force password reset for compromised accounts\n4. Require MFA for all users\n5. Implement device fingerprinting\n6. Use CAPTCHA on login forms\n7. Monitor for distributed login attempts',
          ARRAY['credential-stuffing', 'authentication', 'credential-access', 'mitre-t1110.004']
        )
        ON CONFLICT DO NOTHING
      `);
      
      console.log('  ✅ Seed data inserted successfully');
    });
    
    console.log('✅ Seeding completed!');
    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    await closePool();
    process.exit(1);
  }
}

seedDatabase();