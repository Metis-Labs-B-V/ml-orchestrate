from django.core.management.base import BaseCommand

from app.models import Connection
from app.services.connection_secrets import (
    ConnectionSecretError,
    get_connection_secret_payload,
)


class Command(BaseCommand):
    help = "Backfill plaintext connection secrets into encrypted storage."

    def handle(self, *args, **options):
        total = 0
        migrated = 0
        skipped = 0

        queryset = Connection.objects.filter(is_active=True).order_by("id")
        for connection in queryset.iterator():
            total += 1
            try:
                result = get_connection_secret_payload(connection, persist_migration=True)
            except ConnectionSecretError as exc:
                self.stderr.write(
                    self.style.ERROR(
                        f"Connection {connection.id} ({connection.provider}) failed: {exc.message}"
                    )
                )
                continue
            if result.migrated:
                migrated += 1
            else:
                skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete. total={total}, migrated={migrated}, unchanged={skipped}"
            )
        )
