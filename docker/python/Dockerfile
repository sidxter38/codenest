FROM python:3.11-alpine

# Create non-root user for security
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox

WORKDIR /workspace
RUN chown -R sandbox:sandbox /workspace

USER sandbox

# Limits and unbuffered output
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

CMD ["python", "main.py"]
