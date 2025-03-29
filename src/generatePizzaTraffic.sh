#!/bin/bash

# Check if host is provided as a command line argument
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi
host=$1

register_if_needed() {
  local email=$1
  local password=$2
  local name=$3
  local role=$4
  # Try to login first
  response=$(curl -s -X PUT "$host/api/auth" -d "{\"email\":\"$email\",\"password\":\"$password\"}" -H 'Content-Type: application/json')
  token=$(echo "$response" | jq -r '.token' 2>/dev/null)
  if [ "$token" = "null" ] || [ -z "$token" ]; then
    echo "User $email not found, attempting to register..."
    reg_response=$(curl -s -X POST "$host/api/auth" -d "{\"name\":\"$name\",\"email\":\"$email\",\"password\":\"$password\",\"roles\":[{\"role\":\"$role\"}]}" -H 'Content-Type: application/json')
    reg_token=$(echo "$reg_response" | jq -r '.token' 2>/dev/null)
    if [ "$reg_token" != "null" ] && [ -n "$reg_token" ]; then
      echo "Successfully registered $email"
    else
      echo "Failed to register $email: $reg_response"
      exit 1  # Exit if registration fails to avoid running with missing users
    fi
  else
    echo "User $email already exists, skipping registration"
  fi
}

# Setup phase: Register all required users
echo "Setting up users..."
register_if_needed "d@jwt.com" "diner" "Diner1" "diner"
register_if_needed "d2@jwt.com" "diner2" "Diner2" "diner"
register_if_needed "d3@jwt.com" "diner3" "Diner3" "diner"
register_if_needed "d4@jwt.com" "diner4" "Diner4" "diner"
register_if_needed "d5@jwt.com" "diner5" "Diner5" "diner"
register_if_needed "f@jwt.com" "franchisee" "Franchisee" "franchisee"
echo "User setup complete!"

# Function to cleanly exit
cleanup() {
  echo "Terminating background processes..."
  kill $pid1 $pid2 $pid3 $pid4 $pid5 $pid6 $pid7 $pid8 2>/dev/null
  exit 0
}

# Trap SIGINT (Ctrl+C) to execute the cleanup function
trap cleanup SIGINT

# Simulate a user requesting the menu every 3 seconds
while true; do
  curl -s "$host/api/order/menu" > /dev/null
  echo "Requesting menu..."
  sleep 3
done &
pid1=$!

# Simulate a user with an invalid email and password every 25 seconds
while true; do
  response=$(curl -s -w "%{http_code}" -X PUT "$host/api/auth" -d '{"email":"unknown@jwt.com", "password":"bad"}' -H 'Content-Type: application/json')
  status_code=${response: -3}
  if [ "$status_code" -eq 401 ]; then
    echo "Authentication failed as expected (401) with invalid credentials..."
  else
    echo "Unexpected response with invalid credentials: $status_code"
  fi
  sleep 25
done &
pid2=$!

# Simulate a franchisee logging in every two minutes
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json')
  token=$(echo "$response" | jq -r '.token')
  if [ "$token" != "null" ] && [ -n "$token" ]; then
    echo "Login franchisee successful..."
    sleep 110
    curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
    echo "Logging out franchisee..."
  else
    echo "Franchisee login failed unexpectedly..."
  fi
  sleep 10
done &
pid3=$!

# Simulate a diner ordering a pizza every 20 seconds (successful purchase)
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json')
  token=$(echo "$response" | jq -r '.token')
  if [ "$token" != "null" ] && [ -n "$token" ]; then
    echo "Login diner successful..."
    start_time=$(date +%s)
    curl -s -X POST "$host/api/order" -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}' -H "Authorization: Bearer $token" > /dev/null
    end_time=$(date +%s)
    latency=$((end_time - start_time))
    echo "Bought a pizza (Latency: ${latency}s)..."
    sleep 20
    curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
    echo "Logging out diner..."
  else
    echo "Diner login failed unexpectedly..."
  fi
  sleep 30
done &
pid4=$!

# Simulate high-frequency pizza purchases (multiple diners) every 5 seconds
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d2@jwt.com", "password":"diner2"}' -H 'Content-Type: application/json')
  token=$(echo "$response" | jq -r '.token')
  if [ "$token" != "null" ] && [ -n "$token" ]; then
    echo "Login second diner for bulk purchase..."
    curl -s -X POST "$host/api/order" -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 2, "description": "Pepperoni", "price": 0.10 }, { "menuId": 3, "description": "Cheese", "price": 0.08 }]}' -H "Authorization: Bearer $token" > /dev/null
    echo "Bulk purchase: 2 pizzas..."
    sleep 5
    curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
  else
    echo "Second diner login failed unexpectedly..."
  fi
  sleep 5
done &
pid5=$!

# Simulate pizza creation failure (invalid order data) every 15 seconds
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d3@jwt.com", "password":"diner3"}' -H 'Content-Type: application/json')
  token=$(echo "$response" | jq -r '.token')
  if [ "$token" != "null" ] && [ -n "$token" ]; then
    echo "Login third diner for failed order..."
    response=$(curl -s -w "%{http_code}" -X POST "$host/api/order" -H 'Content-Type: application/json' -d '{"franchiseId": 999, "storeId":999, "items":[{ "menuId": 999, "description": "Invalid Pizza", "price": 0.01 }]}' -H "Authorization: Bearer $token")
    status_code=${response: -3}
    if [ "$status_code" -ge 400 ]; then
      echo "Pizza creation failed as expected (Status: $status_code)..."
    else
      echo "Unexpected success on invalid order: $status_code"
    fi
    sleep 15
    curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
  else
    echo "Third diner login failed unexpectedly..."
  fi
  sleep 15
done &
pid6=$!

# Simulate pizza creation latency with large order every 30 seconds
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d4@jwt.com", "password":"diner4"}' -H 'Content-Type: application/json')
  token=$(echo "$response" | jq -r '.token')
  if [ "$token" != "null" ] && [ -n "$token" ]; then
    echo "Login fourth diner for large order..."
    start_time=$(date +%s)
    curl -s -X POST "$host/api/order" -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }, { "menuId": 2, "description": "Pepperoni", "price": 0.10 }, { "menuId": 3, "description": "Cheese", "price": 0.08 }, { "menuId": 4, "description": "Supreme", "price": 0.15 }]}' -H "Authorization: Bearer $token" > /dev/null
    end_time=$(date +%s)
    latency=$((end_time - start_time))
    echo "Large order (4 pizzas) completed (Latency: ${latency}s)..."
    sleep 30
    curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
  else
    echo "Fourth diner login failed unexpectedly..."
  fi
  sleep 30
done &
pid7=$!

# Simulate revenue per minute tracking (aggregate purchases over 60 seconds)
while true; do
  revenue=0
  start_time=$(date +%s)
  for i in {1..5}; do
    response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d5@jwt.com", "password":"diner5"}' -H 'Content-Type: application/json')
    token=$(echo "$response" | jq -r '.token')
    if [ "$token" != "null" ] && [ -n "$token" ]; then
      curl -s -X POST "$host/api/order" -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}' -H "Authorization: Bearer $token" > /dev/null
      revenue=$(echo "$revenue + 0.05" | bc)
      curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" > /dev/null
    fi
    sleep 2
  done
  end_time=$(date +%s)
  duration=$((end_time - start_time))
  echo "Revenue in last minute: \$$revenue (over ${duration}s)..."
  sleep $((60 - duration))  # Adjust sleep to ensure 60-second cycles
done &
pid8=$!

# Wait for the background processes to complete
wait $pid1 $pid2 $pid3 $pid4 $pid5 $pid6 $pid7 $pid8