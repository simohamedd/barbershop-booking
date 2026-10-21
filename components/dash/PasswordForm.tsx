import { changeOwnPassword } from "@/app/actions/account";
import { ActionForm, Submit } from "./forms";

export function PasswordForm() {
  return (
    <ActionForm action={changeOwnPassword} className="grid max-w-md gap-3" resetOnOk>
      <div><label className="label" htmlFor="pw-c">Current password</label><input id="pw-c" name="current" type="password" required autoComplete="current-password" className="field" /></div>
      <div><label className="label" htmlFor="pw-n">New password</label><input id="pw-n" name="next" type="password" required minLength={10} autoComplete="new-password" className="field" /><p className="hint">At least 10 characters with a number.</p></div>
      <div><label className="label" htmlFor="pw-r">Repeat new password</label><input id="pw-r" name="confirm" type="password" required autoComplete="new-password" className="field" /></div>
      <div><Submit>Change password</Submit></div>
    </ActionForm>
  );
}
