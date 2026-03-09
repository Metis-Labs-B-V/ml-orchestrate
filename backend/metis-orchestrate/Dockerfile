## Dockerfile for metis-orchestrate backend
# Builds a Python/Django application image for deployment
# Use official Python image as base
FROM python:3.12-slim  

# Ensures output is sent straight to terminal (no buffering)
ENV PYTHONUNBUFFERED 1  

# Set working directory in container
WORKDIR /app  

# Install system dependencies
RUN apt-get update \
	&& apt-get install -y curl make \
	&& rm -rf /var/lib/apt/lists/* 

# Copy requirements file
COPY requirements.txt /app/  

# Install Python dependencies
RUN pip install -r requirements.txt  

# Copy project files
COPY . .  

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh  

# Use entrypoint script to manage startup logic
ENTRYPOINT ["/bin/bash", "entrypoint.sh"]
