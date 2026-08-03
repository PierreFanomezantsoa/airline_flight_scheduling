from flask import Blueprint, jsonify
from data.airports import AIRPORTS_DB

airports_bp = Blueprint('airports', __name__)

@airports_bp.route('/airports', methods=['GET'])
def get_airports():
    airport_list = [
        {"iata": code, "name": info["name"], "timezone": info["timezone"]}
        for code, info in AIRPORTS_DB.items()
    ]
    return jsonify(airport_list), 200