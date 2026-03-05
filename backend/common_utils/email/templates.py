def reset_password_email(user_name, reset_url):
    display_name = user_name or "there"
    return f"""
    <html>
    <body style='font-family: Arial, sans-serif; background: #f6f8fa; padding: 40px;'>
      <div style='max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px;'>
        <p>Hi {display_name},</p>
        <p>We received a request to reset your password. Click the button below to choose a new one:</p>
        <div style='text-align: center; margin: 32px 0;'>
          <a href='{reset_url}' style='display: inline-block; background: #101722; color: #fff; padding: 16px 32px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 18px;'>Reset password</a>
        </div>
        <p style='font-size: 14px;'>This link is secure and valid for a limited time.</p>
        <p>If the button doesn’t work, copy and paste this link into your browser:<br>
          <a href='{reset_url}'>{reset_url}</a>
        </p>
        <p>Didn’t request a password reset?<br>You can safely ignore this email.</p>
        <p>Thanks,<br>The Orchestrate Team</p>
      </div>
    </body>
    </html>
    """


def tenant_verification_email(first_name, verification_url, support_email):
    display_name = first_name or "there"
    return f"""
    <html>
    <body style='font-family: Arial, sans-serif; background: #f6f8fa; padding: 40px;'>
      <div style='max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px;'>
        <p>Hi {display_name},</p>
        <p>Welcome to Orchestrate 👋</p>
        <p>To activate your accountant account, please verify your email address by clicking the button below:</p>
        <div style='text-align: center; margin: 32px 0;'>
          <a href='{verification_url}' style='display: inline-block; background: #101722; color: #fff; padding: 16px 32px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 18px;'>👉 Verify my email</a>
        </div>
        <p style='font-size: 14px;'>This link is secure and will expire in 24 hours.<br>For your safety, it can only be used once.</p>
        <p>If the button doesn’t work, copy and paste this link into your browser:<br>
          <a href='{verification_url}'>{verification_url}</a>
        </p>
        <p>Didn’t create this account?<br>You can safely ignore this email. No action is required.</p>
        <p>If you need help, contact us at <a href='mailto:{support_email}'>{support_email}</a>.</p>
        <p>Thanks,<br>The Orchestrate Team</p>
      </div>
    </body>
    </html>
    """


def login_otp_email(user_name, otp):
    display_name = user_name or "there"
    return f"""
    <html>
    <body style='font-family: Arial, sans-serif; background: #f6f8fa; padding: 40px;'>
      <div style='max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px;'>
        <p>Hi {display_name},</p>
        <p>Your one-time password for signing in is:</p>
        <div style='text-align: center; margin: 32px 0;'>
          <span style='display: inline-block; background: #101722; color: #fff; padding: 16px 32px; border-radius: 999px; font-weight: bold; font-size: 24px; letter-spacing: 2px;'>{otp}</span>
        </div>
        <p>This OTP will expire in 10 minutes.</p>
        <p>Didn’t request this code?<br>You can safely ignore this email.</p>
        <p>Thanks,<br>The Orchestrate Team</p>
      </div>
    </body>
    </html>
    """

def user_account_setup_email_template(user_name, setup_url, client_name, support_email):
    display_name = user_name or "there"
    return f"""
    <html>
    <body style='font-family: Arial, sans-serif; background: #f6f8fa; padding: 40px;'>
      <div style='max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px;'>
        <p>Hi {display_name},</p>
        <p>You’ve been added as a user for {client_name} on Orchestrate.</p>
        <p>To get started, please set up your account by creating a password using the link below:</p>
        <div style='text-align: center; margin: 32px 0;'>
          <a href='{setup_url}' style='display: inline-block; background: #101722; color: #fff; padding: 16px 32px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 18px;'>👉 Set up my account</a>
        </div>
        <p style='font-size: 14px;'>This link is secure and will expire in 24 hours.<br>For your safety, it can only be used once.</p>
        <p>If the button doesn’t work, copy and paste this link into your browser:<br>
          <a href='{setup_url}'>{setup_url}</a>
        </p>
        <p>What happens next?</p>
        <ol style='padding-left: 20px; line-height: 1.6;'>
          <li>You’ll set your password</li>
          <li>Your account will be activated</li>
          <li>You can then log in and access the platform</li>
        </ol>
        <p>If you were not expecting this invitation, you can safely ignore this email.</p>
        <p>Need help? Contact us at <a href='mailto:{support_email}'>{support_email}</a>.</p>
        <p>Thanks,<br>The Orchestrate Team</p>
      </div>
    </body>
    </html>
    """