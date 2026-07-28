import { render } from "@react-email/render";
import {
  QUESTIONNAIRE_INVITE_SUBJECT,
  QuestionnaireInviteEmail,
  type QuestionnaireInviteEmailProps,
} from "@/lib/emails/QuestionnaireInviteEmail";

export async function renderQuestionnaireInviteEmail(
  props: QuestionnaireInviteEmailProps,
): Promise<{ subject: string; html: string }> {
  const html = await render(QuestionnaireInviteEmail(props));

  return {
    subject: QUESTIONNAIRE_INVITE_SUBJECT,
    html,
  };
}
