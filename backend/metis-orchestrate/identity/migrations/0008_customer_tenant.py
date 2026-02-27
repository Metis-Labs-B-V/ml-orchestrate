from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0007_user_otp_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="customers",
                to="identity.tenant",
            ),
        ),
    ]
