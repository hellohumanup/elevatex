import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type QuestionnaireInviteEmailProps = {
  participantName: string;
  groupName: string;
  magicUrl: string;
};

export const QUESTIONNAIRE_INVITE_SUBJECT =
  "Invitación a la Dinámica de Equipo en Vínculo";

export function QuestionnaireInviteEmail({
  participantName,
  groupName,
  magicUrl,
}: QuestionnaireInviteEmailProps) {
  const safeName = participantName.trim() || "Colaborador";
  const safeGroup = groupName.trim() || "tu equipo";

  return (
    <Html lang="es">
      <Head />
      <Preview>
        {safeName}, estás invitado/a a la dinámica de equipo de {safeGroup} en
        Vínculo.
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.badgeRow}>
            <Text style={styles.badge}>Vínculo · Dinámica de Equipo</Text>
          </Section>

          <Heading style={styles.heading}>Hola, {safeName}</Heading>

          <Text style={styles.lead}>
            Has sido invitado/a a participar en la{" "}
            <strong style={styles.strong}>Dinámica de Equipo</strong> del grupo{" "}
            <strong style={styles.strong}>{safeGroup}</strong> en Vínculo.
          </Text>

          <Text style={styles.paragraph}>
            Tu perspectiva es esencial para construir un mapa fiable de
            colaboración, influencia y cohesión. El cuestionario es confidencial
            y toma aproximadamente 10–15 minutos.
          </Text>

          <Section style={styles.ctaSection}>
            <Button href={magicUrl} style={styles.button}>
              Acceder a mi cuestionario
            </Button>
          </Section>

          <Text style={styles.urlFallback}>{magicUrl}</Text>

          <Hr style={styles.hr} />

          <Text style={styles.footer}>
            Este enlace es personal y seguro. No lo compartas con otras
            personas. Si no esperabas este correo, puedes ignorarlo con
            tranquilidad.
          </Text>

          <Text style={styles.signature}>
            Vínculo · Diagnóstico sistémico para equipos y organizaciones
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f1f5f9",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: "0",
    padding: "24px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px 36px",
  },
  badgeRow: {
    margin: "0 0 20px 0",
  },
  badge: {
    color: "#4f46e5",
    fontSize: "11px",
    fontWeight: "700" as const,
    letterSpacing: "0.14em",
    margin: "0",
    textTransform: "uppercase" as const,
  },
  heading: {
    color: "#0f172a",
    fontSize: "24px",
    fontWeight: "600" as const,
    lineHeight: "1.35",
    margin: "0 0 16px 0",
  },
  lead: {
    color: "#334155",
    fontSize: "15px",
    lineHeight: "1.7",
    margin: "0 0 12px 0",
  },
  paragraph: {
    color: "#475569",
    fontSize: "15px",
    lineHeight: "1.7",
    margin: "0 0 24px 0",
  },
  strong: {
    color: "#0f172a",
    fontWeight: "600" as const,
  },
  ctaSection: {
    margin: "0 0 16px 0",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#4f46e5",
    borderRadius: "10px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600" as const,
    padding: "14px 28px",
    textDecoration: "none",
  },
  urlFallback: {
    color: "#94a3b8",
    fontSize: "12px",
    lineHeight: "1.6",
    margin: "0 0 24px 0",
    wordBreak: "break-all" as const,
  },
  hr: {
    borderColor: "#e2e8f0",
    margin: "0 0 20px 0",
  },
  footer: {
    color: "#64748b",
    fontSize: "13px",
    lineHeight: "1.6",
    margin: "0 0 12px 0",
  },
  signature: {
    color: "#94a3b8",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0",
  },
} as const;

export default QuestionnaireInviteEmail;
