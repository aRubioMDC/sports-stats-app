"""add hockey_player_game_stats table

Revision ID: a1b2c3d4e5f6
Revises: c7aebfcc974d
Create Date: 2026-09-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'c7aebfcc974d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('hockey_player_game_stats',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('player_id', sa.Integer(), nullable=False),
    sa.Column('game_id', sa.Integer(), nullable=True),
    sa.Column('nhl_game_id', sa.Integer(), nullable=False),
    sa.Column('season', sa.Integer(), nullable=False),
    sa.Column('game_date', sa.String(length=16), nullable=False),
    sa.Column('opponent_team_id', sa.Integer(), nullable=True),
    sa.Column('is_home', sa.Boolean(), nullable=False),
    sa.Column('goals', sa.Float(), nullable=False),
    sa.Column('assists', sa.Float(), nullable=False),
    sa.Column('points', sa.Float(), nullable=False),
    sa.Column('shots_on_goal', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
    sa.ForeignKeyConstraint(['game_id'], ['games.id'], ),
    sa.ForeignKeyConstraint(['opponent_team_id'], ['teams.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('player_id', 'nhl_game_id')
    )
    op.create_index(op.f('ix_hockey_player_game_stats_player_id'), 'hockey_player_game_stats', ['player_id'], unique=False)
    op.create_index(op.f('ix_hockey_player_game_stats_nhl_game_id'), 'hockey_player_game_stats', ['nhl_game_id'], unique=False)
    op.create_index(op.f('ix_hockey_player_game_stats_season'), 'hockey_player_game_stats', ['season'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_hockey_player_game_stats_season'), table_name='hockey_player_game_stats')
    op.drop_index(op.f('ix_hockey_player_game_stats_nhl_game_id'), table_name='hockey_player_game_stats')
    op.drop_index(op.f('ix_hockey_player_game_stats_player_id'), table_name='hockey_player_game_stats')
    op.drop_table('hockey_player_game_stats')
