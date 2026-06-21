#!/bin/bash

# Exit on error
set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}    ParkIQ – Intelligent Transportation System      ${NC}"
echo -e "${BLUE}====================================================${NC}"

# Check for Python virtual environment
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}[System] Creating virtual environment...${NC}"
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install Python dependencies
echo -e "${BLUE}[Backend] Verifying Python dependencies...${NC}"
pip install -r requirements.txt

# Verify CSV dataset
CSV_PATH="jan to may police violation_anonymized791b166.csv"
ZIP_PATH="jan to may police violation_anonymized791b166.zip"
if [ ! -f "$CSV_PATH" ]; then
    if [ -f "$ZIP_PATH" ]; then
        echo -e "${YELLOW}[Data] Extracting dataset from zip...${NC}"
        unzip -q "$ZIP_PATH" -d .
    else
        echo -e "${RED}[Error] Dataset file ($CSV_PATH) not found!${NC}"
        exit 1
    fi
fi

# Verify trained model
MODEL_FILE="model/saved_models/hotspot_model.pkl"
if [ ! -f "$MODEL_FILE" ]; then
    echo -e "${YELLOW}[Model] Model not found. Training the model (this may take a few minutes)...${NC}"
    cd model/src
    python train.py
    python evaluate.py
    cd ../..
fi

# Install frontend dependencies
echo -e "${BLUE}[Frontend] Verifying Node/NPM dependencies...${NC}"
cd frontend
npm install
cd ..

# Cleanup function on exit
cleanup() {
    echo -e "\n${YELLOW}[System] Stopping all services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
    fi
    exit 0
}

# Trap Ctrl+C (SIGINT) and exit
trap cleanup SIGINT SIGTERM

# Start Backend Server
echo -e "${GREEN}[Backend] Starting FastAPI server on http://localhost:8000 ...${NC}"
cd backend
python -m app.main > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
echo -e "${YELLOW}[Backend] Waiting for server to initialize...${NC}"
until curl -s http://localhost:8000/ > /dev/null; do
    sleep 1
done
echo -e "${GREEN}[Backend] Server is ready!${NC}"

# Start Frontend Dev Server
echo -e "${GREEN}[Frontend] Starting Vite server on http://localhost:5173 ...${NC}"
cd frontend
npm run dev

# Wait for frontend process
wait
