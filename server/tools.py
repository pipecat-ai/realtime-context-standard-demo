#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Order tools for the Northwind Outfitters support agent.

Each tool is a direct function: Pipecat builds its schema from the signature and
Google-style docstring, so listing it in ``LLMContext(tools=TOOLS)`` registers
it. The "backend" is an in-memory ``OrderStore``, shared with the handlers
through ``PipelineWorker(app_resources=...)`` as ``params.app_resources``.

Alongside the order tools, ``end_call`` hangs the call up.
"""

from datetime import date, timedelta
from typing import Any

from loguru import logger
from pipecat.adapters.llm.schemas.direct_function import tool_options
from pipecat.frames.frames import EndWorkerFrame
from pipecat.services.llm_service import FunctionCallParams

SHIPPING_COSTS = {"standard": 0.0, "express": 15.0}

NOT_FOUND = {"success": False, "message": "No order matches that order number."}


def _digits(order_number: str) -> str:
    # Spoken order numbers reach the LLM with spaces or dashes in them.
    return "".join(c for c in order_number if c.isdigit())


def _price(order: dict[str, Any]) -> None:
    subtotal = sum(item["quantity"] * item["price"] for item in order["items"])
    order["shipping_cost"] = SHIPPING_COSTS[order["shipping_speed"]]
    order["total"] = round(subtotal + order["shipping_cost"], 2)


class OrderStore:
    """In-memory stand-in for the shop's order system, one per session.

    Seeded with an order in each state the tools handle: one still processing,
    which can be changed or cancelled, one shipped and one delivered.
    """

    def __init__(self) -> None:
        today = date.today()
        orders = [
            {
                "order_number": "51077",
                "name": "Jordan Lee",
                "status": "processing",
                "placed": (today - timedelta(days=1)).isoformat(),
                "items": [
                    {"item": "20 degree down sleeping bag", "quantity": 1, "price": 249.0},
                    {"item": "Insulated sleeping pad", "quantity": 1, "price": 129.0},
                ],
                "shipping_speed": "standard",
                "shipping_address": "42 Pine Street, Boulder, CO 80302",
            },
            {
                "order_number": "48213",
                "name": "Alex Rivera",
                "status": "shipped",
                "placed": (today - timedelta(days=6)).isoformat(),
                "items": [
                    {"item": "Two-person backpacking tent", "quantity": 1, "price": 289.0},
                ],
                "shipping_speed": "standard",
                "shipping_address": "1180 Cedar Avenue, Portland, OR 97214",
                "tracking_number": "1Z84A7703",
                "estimated_delivery": (today + timedelta(days=1)).isoformat(),
            },
            {
                "order_number": "39560",
                "name": "Priya Patel",
                "status": "delivered",
                "placed": (today - timedelta(days=12)).isoformat(),
                "items": [
                    {"item": "Waterproof hiking boots", "quantity": 1, "price": 179.0},
                    {"item": "Merino wool hiking socks", "quantity": 3, "price": 18.0},
                ],
                "shipping_speed": "express",
                "shipping_address": "7 Summit Road, Bend, OR 97701",
                "delivered": (today - timedelta(days=3)).isoformat(),
            },
        ]
        for order in orders:
            _price(order)
        self.orders: dict[str, dict[str, Any]] = {o["order_number"]: o for o in orders}

    def get(self, order_number: str) -> dict[str, Any] | None:
        return self.orders.get(_digits(order_number))

    def find(self, order_number: str | None, name: str | None) -> list[dict[str, Any]]:
        if order_number:
            order = self.get(order_number)
            return [order] if order else []
        if name:
            needle = name.strip().lower()
            return [o for o in self.orders.values() if o["name"].lower() == needle]
        return []


def _locked(order: dict[str, Any]) -> dict[str, Any]:
    """The failure result for an order that's past processing."""
    return {
        "success": False,
        "message": f"Order {order['order_number']} is already {order['status']}, "
        "so it can't be changed or cancelled.",
        "order": order,
    }


async def get_order(
    params: FunctionCallParams,
    order_number: str | None = None,
    name: str | None = None,
):
    """Look up a customer's orders by order number, or by the name they're under.

    Args:
        order_number: The five-digit order number, e.g. '48213'.
        name: The customer's full name, e.g. 'Alex Rivera'.
    """
    store: OrderStore = params.app_resources
    orders = store.find(order_number, name)
    logger.info(f"get_order({order_number=}, {name=}) -> {orders}")
    if orders:
        await params.result_callback({"found": True, "orders": orders})
    else:
        await params.result_callback(
            {"found": False, "message": "No order matches that order number or name."}
        )


async def update_order(
    params: FunctionCallParams,
    order_number: str,
    shipping_address: str | None = None,
    shipping_speed: str | None = None,
):
    """Change the shipping address or shipping speed of an order that hasn't shipped.

    Pass only the fields the customer wants changed.

    Args:
        order_number: The five-digit order number, e.g. '51077'.
        shipping_address: The full new address, with street, city, state and ZIP code.
        shipping_speed: 'standard' (free, 5 to 7 business days) or 'express'
            (15 dollars, 2 business days).
    """
    store: OrderStore = params.app_resources
    order = store.get(order_number)
    if not order:
        result = NOT_FOUND
    elif order["status"] != "processing":
        result = _locked(order)
    elif shipping_speed and shipping_speed not in SHIPPING_COSTS:
        result = {"success": False, "message": "Shipping speed must be standard or express."}
    else:
        if shipping_address:
            order["shipping_address"] = shipping_address
        if shipping_speed:
            order["shipping_speed"] = shipping_speed
            _price(order)
        result = {"success": True, "order": order}
    logger.info(
        f"update_order({order_number=}, {shipping_address=}, {shipping_speed=}) -> {result}"
    )
    await params.result_callback(result)


async def cancel_order(params: FunctionCallParams, order_number: str):
    """Cancel an order that hasn't shipped, once the customer has confirmed they want to.

    The refund goes back to the original payment method in 3 to 5 business days.

    Args:
        order_number: The five-digit order number, e.g. '51077'.
    """
    store: OrderStore = params.app_resources
    order = store.get(order_number)
    if not order:
        result = NOT_FOUND
    elif order["status"] != "processing":
        result = _locked(order)
    else:
        order["status"] = "cancelled"
        result = {"success": True, "order": order, "refund": order["total"]}
    logger.info(f"cancel_order({order_number=}) -> {result}")
    await params.result_callback(result)


# cancel_on_interruption=False so the bot's own farewell bleeding back through
# the mic can't register as a new turn and cancel the hang-up.
@tool_options(cancel_on_interruption=False)
async def end_call(params: FunctionCallParams):
    """End the call and hang up.

    Use this once the customer is finished: they say goodbye, or their question is
    settled and they need nothing else. Say a short farewell in the same turn: the
    call stays up until it has finished playing.
    """
    logger.info("end_call -> hanging up once the farewell has played")
    # EndWorkerFrame drains the queued frames, the farewell's audio among them,
    # before the worker shuts down.
    await params.result_callback(None)
    await params.llm.push_frame(EndWorkerFrame())


TOOLS = [get_order, update_order, cancel_order, end_call]
